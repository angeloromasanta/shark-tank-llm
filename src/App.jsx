import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, doc, getDoc, setDoc, where, updateDoc } from 'firebase/firestore';
import { useNavigate, useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
// First, add imports for LLM avatars at the top of your file

// Update the availableLLMs array to include brand colors
const availableLLMs = [
  {
    id: 'gemini',
    name: 'Gemini',
    avatarBg: '#1C69FF', // Darker teal for better contrast with white SVG
    brandColor: '#1C69FF', // Gemini brand color
    avatarText: 'G',
    apiId: 'google/gemini-flash-1.5',
    avatarSrc: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/gemini.svg'
  },
  {
    id: 'claude',
    name: 'Claude',
    avatarBg: '#D97757', // Darker purple for better contrast
    brandColor: '#D97757', // Claude brand color
    avatarText: 'C',
    apiId: 'anthropic/claude-3-haiku',
    avatarSrc: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/claude.svg'
  },
  {
    id: 'llama',
    name: 'Llama',
    avatarBg: 'grey', // Darker amber
    brandColor: 'grey', // Llama brand color
    avatarText: 'L',
    apiId: 'meta-llama/llama-3-70b-instruct',
    avatarSrc: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/ollama.svg'
  },
  {
    id: 'gpt4',
    name: 'GPT-4',
    avatarBg: 'bg-green-600', // Darker green
    brandColor: '#19A37F', // OpenAI brand color
    avatarText: 'G4',
    apiId: 'openai/gpt-4o-mini',
    avatarSrc: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/openai.svg'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    avatarBg: '#FA520F', // Darker blue
    brandColor: '#FA520F', // Mistral brand color
    avatarText: 'M',
    apiId: 'mistralai/mistral-nemo',
    avatarSrc: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/mistral.svg'
  },
  {
    id: 'qwen',
    name: 'Qwen',
    avatarBg: '#615CED', // Darker red
    brandColor: '#615CED', // Qwen brand color
    avatarText: 'Gr',
    apiId: 'qwen/qwen-2.5-coder-32b-instruct',
    avatarSrc: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/qwen.svg'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    avatarBg: '#4D6BFE', // Darker red
    brandColor: '#4D6BFE', // Qwen brand color
    avatarText: 'D',
    apiId: 'deepseek/deepseek-chat',
    avatarSrc: 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons/deepseek.svg'
  }
];


const stances = ['pro', 'neutral', 'against'];
const stanceColors = {
  pro: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    accent: 'bg-emerald-100'
  },
  neutral: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    accent: 'bg-blue-100'
  },
  against: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    accent: 'bg-rose-100'
  }
};


function App({ showLeaderboard: initialShowLeaderboard = false }) {
  // Setup state
  const [setupComplete, setSetupComplete] = useState(false);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [numRounds, setNumRounds] = useState(3);
  const [selectedLLMs, setSelectedLLMs] = useState(
    availableLLMs.map(llm => ({
      ...llm,
      selected: true,
      stance: 'neutral',
      proCount: 0,
      neutralCount: 1, // Default 1 neutral for each model
      againstCount: 0
    }))
  );

  // Game state
  const [currentRound, setCurrentRound] = useState(0);
  const [roundSetup, setRoundSetup] = useState([]);
  const [discussions, setDiscussions] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  const [votes, setVotes] = useState({});
  const [votingReasons, setVotingReasons] = useState({}); // Store reasons for votes
  const [activeLLMs, setActiveLLMs] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [currentStep, setCurrentStep] = useState('setup'); // 'setup', 'discussion', 'voting', 'elimination', 'next-round'
  const [streamingStatus, setStreamingStatus] = useState({}); // Track streaming progress for each LLM

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState({
    models: {},
    games: []
  });

  // Player map (maps real LLM IDs to player names)
  const [playerMap, setPlayerMap] = useState({});
  const [showLeaderboard, setShowLeaderboard] = useState(initialShowLeaderboard);
  const navigate = useNavigate();
  const { gameId: urlGameId } = useParams();

  // Add this to your existing useEffect or create a new one
  useEffect(() => {
    const loadGame = async () => {
      if (urlGameId) {
        setIsLoading(true);
        setLoadingText('Loading game...');

        try {
          // Query Firestore for the game with this ID
          const gamesRef = collection(db, "llm-sharktank-games");
          const q = query(gamesRef, where("id", "==", urlGameId));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const gameData = querySnapshot.docs[0].data();

            // Set all the game state from the loaded data
            setProductName(gameData.productName);
            setProductDescription(gameData.productDescription);
            setNumRounds(gameData.numRounds);
            setPlayerMap(gameData.participants.reduce((map, p) => {
              map[p.id] = p.playerName;
              return map;
            }, {}));

            // Load all participants
            setActiveLLMs(gameData.participants.map(p => {
              const baseLLM = availableLLMs.find(llm => llm.id === p.id.split('-')[0]);
              return {
                ...baseLLM,
                instanceId: p.id,
                stance: p.stance,
                eliminated: false,
                comments: []
              };
            }));

            // Load rounds data if available
            if (gameData.rounds && gameData.rounds.length > 0) {
              setDiscussions(gameData.rounds.map(r => ({
                round: r.roundNumber,
                comments: r.discussions || []
              })));

              setEliminations(gameData.rounds.map(r => ({
                round: r.roundNumber,
                eliminated: r.eliminations?.eliminated || [],
                votes: r.eliminations?.votes || {},
                reasons: r.eliminations?.reasons || {},
                endDiscussionVotes: r.eliminations?.endDiscussionVotes || 0
              })));

              // Set the current round to the latest completed round
              setCurrentRound(gameData.rounds.length);
            }

            setGameId(urlGameId);
            setSetupComplete(true);
            setCurrentStep(gameData.status === 'completed' ? 'post' : 'discussion');

            if (gameData.status === 'completed') {
              setGameOver(true);
              setWinner(gameData.winners || []);
            }
          } else {
            // Game not found
            navigate('/');
          }
        } catch (error) {
          console.error("Error loading game:", error);
          navigate('/');
        }

        setIsLoading(false);
      }
    };

    loadGame();
  }, [urlGameId, navigate]);




  // Load leaderboard on component mount
  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const leaderboardRef = doc(db, "llm-sharktank", "leaderboard");
        const docSnap = await getDoc(leaderboardRef);

        if (docSnap.exists()) {
          setLeaderboard(docSnap.data());
        } else {
          // Initialize leaderboard
          await addDoc(collection(db, "llm-sharktank"), {
            models: {},
            games: []
          });
        }
      } catch (error) {
        console.error("Error loading leaderboard:", error);
      }
    };

    loadLeaderboard();
  }, []);


  // Helper function to get the base model ID from an instance ID
  const getBaseModelId = (instanceId) => {
    // E.g., from "claude-pro-1" to "claude"
    return instanceId.split('-')[0];
  };

  const getLLMAvatar = (llmId, size = 36) => {
    // Extract the base model ID (e.g., "claude" from "claude-pro-1")
    const baseModelId = llmId.split('-')[0];
    // Find the model in our available LLMs
    const model = availableLLMs.find(model => model.id === baseModelId);

    // Determine stance for color styling
    const stance = llmId.includes('-pro-') ? 'pro' :
      llmId.includes('-against-') ? 'against' : 'neutral';

    if (model && model.avatarSrc) {
      return (
        <div
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: size,
            height: size,
            backgroundColor: model.brandColor || '#6B7280',
            padding: Math.max(4, size * 0.15) + 'px'
          }}
        >
          <img
            src={model.avatarSrc}
            alt={model.name}
            className="w-full h-full object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>
      );
    }

    // Fallback to text avatar with stance color if no SVG icon is available
    const stanceColor = stanceColors[stance].accent;
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full ${stanceColor} text-sm font-medium text-white`}
        style={{ width: size, height: size }}
      >
        {model?.avatarText || llmId.charAt(0).toUpperCase()}
      </span>
    );
  };


  // Call OpenRouter API with streaming
  const callOpenRouterWithStreaming = async (prompt, modelId, onChunk) => {
    setIsStreaming(true);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "user", content: prompt }
          ],
          stream: true,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(line => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || "";
              if (content) {
                result += content;
                onChunk(result);
              }
            } catch (e) {
              console.error("Error parsing stream data:", e);
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      return "Error generating content. Please try again.";
    } finally {
      setIsStreaming(false);
    }
  };

  // Helper function for non-streaming API calls
  const callOpenRouter = async (prompt, modelId) => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "user", content: prompt }
          ],
        }),
      });

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      return "Error generating content. Please try again.";
    }
  };

  // Handle stance count change
  const handleStanceCountChange = (id, stanceType, increment) => {
    setSelectedLLMs(prev =>
      prev.map(llm => {
        if (llm.id === id) {
          const currentCount = llm[`${stanceType}Count`];
          const newCount = increment
            ? Math.min(currentCount + 1, 5) // Max 5 instances
            : Math.max(currentCount - 1, 0); // Min 0 instances
          return {
            ...llm,
            [`${stanceType}Count`]: newCount
          };
        }
        return llm;
      })
    );
  };

  // Generate player name map
  const generatePlayerMap = (llms) => {
    const map = {};
    let playerCounter = 1;

    // Make sure we have a valid array of LLMs
    if (!Array.isArray(llms) || llms.length === 0) {
      console.error('Invalid LLMs array provided to generatePlayerMap');
      return map;
    }

    // First, ensure that all LLMs have valid instanceIds
    const validLLMs = llms.filter(llm => llm && llm.instanceId);

    // Assign a sequential player number to each LLM instance
    validLLMs.forEach(llm => {
      map[llm.instanceId] = `Player ${playerCounter}`;
      playerCounter++;
    });

    console.log("Generated player map:", map);
    return map;
  };
  // Complete setup and start the game
// Update the completeSetup function to ensure navigation works
const completeSetup = async () => {
  if (!productName.trim() || !productDescription.trim()) {
    alert('Please enter a product name and description');
    return;
  }

  // Check that at least one model has a count > 0
  const totalModels = selectedLLMs.reduce(
    (sum, llm) => sum + llm.proCount + llm.neutralCount + llm.againstCount,
    0
  );

  if (totalModels < 2) {
    alert('Please include at least 2 LLM instances');
    return;
  }

  setIsLoading(true);
  setLoadingText('Setting up game...');

  // Initialize active LLMs with assigned stances
  const initializedLLMs = [];
  let globalPlayerCounter = 1; // Single counter for all instances

  for (const llm of selectedLLMs) {
    // Only include models with at least one instance
    if (llm.proCount > 0 || llm.neutralCount > 0 || llm.againstCount > 0) {
      // Add pro instances
      for (let i = 0; i < llm.proCount; i++) {
        initializedLLMs.push({
          ...llm,
          instanceId: `${llm.id}-pro-${i}`, // Keep original counter for internal tracking
          playerNumber: globalPlayerCounter, // Add explicit player number
          stance: 'pro',
          eliminated: false,
          comments: []
        });
        globalPlayerCounter++; // Increment global counter
      }

      // Add neutral instances
      for (let i = 0; i < llm.neutralCount; i++) {
        initializedLLMs.push({
          ...llm,
          instanceId: `${llm.id}-neutral-${i}`, // Keep original counter for internal tracking
          playerNumber: globalPlayerCounter, // Add explicit player number
          stance: 'neutral',
          eliminated: false,
          comments: []
        });
        globalPlayerCounter++; // Increment global counter
      }

      // Add against instances
      for (let i = 0; i < llm.againstCount; i++) {
        initializedLLMs.push({
          ...llm,
          instanceId: `${llm.id}-against-${i}`, // Keep original counter for internal tracking
          playerNumber: globalPlayerCounter, // Add explicit player number
          stance: 'against',
          eliminated: false,
          comments: []
        });
        globalPlayerCounter++; // Increment global counter
      }
    }
  }

  // Now update the player map generation to use the explicit player number
  const newPlayerMap = {};
  initializedLLMs.forEach(llm => {
    newPlayerMap[llm.instanceId] = `Player ${llm.playerNumber}`;
  });
  setPlayerMap(newPlayerMap);
  setActiveLLMs(initializedLLMs);

  // Setup rounds
  const rounds = [];
  for (let i = 1; i <= numRounds; i++) {
    rounds.push({
      roundNumber: i,
      discussions: [],
      eliminations: []
    });
  }

  setRoundSetup(rounds);
  setCurrentRound(1);

  // Generate game ID
  const timestamp = new Date().getTime();
  const newGameId = `game-${timestamp}`;
  setGameId(newGameId);

  // Save the initial game setup to Firebase
  try {
    const docRef = await addDoc(collection(db, "llm-sharktank-games"), {
      id: newGameId,
      productName,
      productDescription,
      numRounds,
      participants: initializedLLMs.map(llm => ({
        id: llm.instanceId,
        name: llm.name,
        stance: llm.stance,
        playerNumber: llm.playerNumber,
        playerName: newPlayerMap[llm.instanceId]
      })),
      timestamp: new Date(),
      status: 'in-progress',
      rounds: []
    });

    // Update state before navigation
    setSetupComplete(true);
    setCurrentStep('discussion');
    
    // Initialize streaming status for all LLMs
    const initialStreamingStatus = {};
    initializedLLMs.forEach(llm => {
      initialStreamingStatus[llm.instanceId] = {
        isStreaming: false,
        content: ''
      };
    });
    setStreamingStatus(initialStreamingStatus);
    
    // Start first round discussions before navigating
    startRound(1, initializedLLMs);
    
    // Make sure to wait a moment before navigation to ensure state has updated
    setTimeout(() => {
      // Navigate to the unique game URL
      if (navigate) {
        navigate(`/game/${newGameId}`);
      }
    }, 100);
    
  } catch (error) {
    console.error("Error saving game setup:", error);
    setIsLoading(false);
    alert("Error creating game. Please try again.");
  } finally {
    setIsLoading(false);
  }
};

  const updateGameInFirebase = async () => {
    if (!gameId) return;

    setIsLoading(true);
    setLoadingText('Saving game state...');

    try {
      // Find the document with this game ID
      const gamesRef = collection(db, "llm-sharktank-games");
      const q = query(gamesRef, where("id", "==", gameId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const docRef = querySnapshot.docs[0].ref;

        // Prepare the rounds data with discussions and eliminations
        const roundsData = discussions.map(discussion => {
          const roundNumber = discussion.round;
          const elimination = eliminations.find(e => e.round === roundNumber);

          return {
            roundNumber,
            discussions: discussion.comments,
            eliminations: elimination || null
          };
        });

        // Prepare winners data if game is over
        let winnersData = [];
        if (gameOver) {
          if (Array.isArray(winner)) {
            winnersData = winner.map(w => ({
              id: w.instanceId,
              name: w.name,
              stance: w.stance,
              playerName: playerMap[w.instanceId]
            }));
          } else if (winner) {
            winnersData = [{
              id: winner.instanceId,
              name: winner.name,
              stance: winner.stance,
              playerName: playerMap[winner.instanceId]
            }];
          }
        }

        // Update the document
        await updateDoc(docRef, {
          status: gameOver ? 'completed' : 'in-progress',
          rounds: roundsData,
          winners: winnersData,
          lastUpdated: new Date()
        });

        console.log("Game state saved successfully!");
      } else {
        console.error("Game document not found");
      }
    } catch (error) {
      console.error("Error updating game:", error);
    } finally {
      setIsLoading(false);
    }
  };


  // Generate initial LLM comments for a round
  const startRound = async (roundNumber, currentLLMs) => {
    // Initialize empty discussions structure
    const roundDiscussions = [];
    const activeLLMs = currentLLMs.filter(llm => !llm.eliminated);

    // Initialize discussion structure with empty comments
    activeLLMs.forEach(llm => {
      // Make sure we have the player name from the map, or generate one from the player number
      const playerDisplayName = playerMap[llm.instanceId] || `Player ${llm.playerNumber || '?'}`;

      roundDiscussions.push({
        llmId: llm.instanceId,
        llmName: llm.name,
        avatarText: llm.avatarText || llm.name.charAt(0),
        playerName: playerDisplayName,
        playerNumber: llm.playerNumber || parseInt(playerDisplayName.split(' ')[1]) || '?',
        stance: llm.stance,
        comment: '',
        votes: 0
      });
    });

    // Add empty discussion to state to make UI render before we have content
    setDiscussions(prev => [...prev, { round: roundNumber, comments: roundDiscussions }]);

    // Prepare streaming status for this round
    const newStreamingStatus = {};
    activeLLMs.forEach(llm => {
      newStreamingStatus[llm.instanceId] = {
        isStreaming: true,
        content: ''
      };
    });
    setStreamingStatus(newStreamingStatus);

    // Start streaming for each LLM
    for (const llm of activeLLMs) {
      const prompt = generatePrompt(llm, roundNumber);

      // Start async streaming
      (async () => {
        try {
          // Use streaming to update the comment in real-time
          await callOpenRouterWithStreaming(
            prompt,
            llm.apiId,
            (content) => {
              // Update streaming status
              setStreamingStatus(prev => ({
                ...prev,
                [llm.instanceId]: {
                  isStreaming: true,
                  content
                }
              }));

              // Also update the discussions array
              setDiscussions(prevDiscussions => {
                // Find the current round discussion
                const updatedDiscussions = [...prevDiscussions];
                const roundIndex = updatedDiscussions.findIndex(d => d.round === roundNumber);

                if (roundIndex !== -1) {
                  // Find the comment for this LLM
                  const commentIndex = updatedDiscussions[roundIndex].comments.findIndex(
                    c => c.llmId === llm.instanceId
                  );

                  if (commentIndex !== -1) {
                    // Update the comment
                    updatedDiscussions[roundIndex].comments[commentIndex].comment = content;
                  }
                }

                return updatedDiscussions;
              });
            }
          );

          // Mark streaming as complete for this LLM
          setStreamingStatus(prev => ({
            ...prev,
            [llm.instanceId]: {
              ...prev[llm.instanceId],
              isStreaming: false
            }
          }));

        } catch (error) {
          console.error(`Error getting comment from ${llm.name}:`, error);

          // Update with error message
          setStreamingStatus(prev => ({
            ...prev,
            [llm.instanceId]: {
              isStreaming: false,
              content: `[${llm.name} was unable to provide feedback due to a technical issue]`
            }
          }));

          // Also update discussions array
          setDiscussions(prevDiscussions => {
            const updatedDiscussions = [...prevDiscussions];
            const roundIndex = updatedDiscussions.findIndex(d => d.round === roundNumber);

            if (roundIndex !== -1) {
              const commentIndex = updatedDiscussions[roundIndex].comments.findIndex(
                c => c.llmId === llm.instanceId
              );

              if (commentIndex !== -1) {
                updatedDiscussions[roundIndex].comments[commentIndex].comment =
                  `[${llm.name} was unable to provide feedback due to a technical issue]`;
              }
            }

            return updatedDiscussions;
          });
        }
      })();
    }
  };

  // Proceed to voting
  const proceedToVoting = () => {
    setCurrentStep('voting');
    startVoting(currentRound, activeLLMs);
    updateGameInFirebase();
  };

  // Start the voting process with streaming comments
  const startVoting = async (roundNumber, currentLLMs) => {
    const activeLLMs = currentLLMs.filter(llm => !llm.eliminated);

    // Initialize voting reasons state
    const initialVotingReasons = {};
    activeLLMs.forEach(llm => {
      initialVotingReasons[llm.instanceId] = {
        isStreaming: true,
        content: '',
        votedFor: null
      };
    });
    setVotingReasons(initialVotingReasons);

    // Get current round discussions
    const currentRoundData = discussions.find(d => d.round === roundNumber);
    const roundDiscussions = currentRoundData?.comments || [];

    // Start voting for each LLM
    for (const voter of activeLLMs) {
      const votingPrompt = generateVotingPrompt(voter, roundNumber, roundDiscussions);

      // Use streaming for voting
      (async () => {
        try {
          await callOpenRouterWithStreaming(
            votingPrompt,
            voter.apiId,
            (content) => {
              // Update voting reasons
              setVotingReasons(prev => ({
                ...prev,
                [voter.instanceId]: {
                  ...prev[voter.instanceId],
                  isStreaming: true,
                  content,
                  votedFor: parseVote(content, activeLLMs.map(llm => llm.instanceId))
                }
              }));
            }
          );

          // Mark streaming as complete
          setVotingReasons(prev => ({
            ...prev,
            [voter.instanceId]: {
              ...prev[voter.instanceId],
              isStreaming: false
            }
          }));

        } catch (error) {
          console.error(`Error getting vote from ${voter.name}:`, error);

          // Update with error message
          setVotingReasons(prev => ({
            ...prev,
            [voter.instanceId]: {
              isStreaming: false,
              content: `[${voter.name} was unable to vote due to a technical issue]`,
              votedFor: null
            }
          }));
        }
      })();
    }
  };

  // Proceed to elimination results
  const proceedToElimination = () => {
    setCurrentStep('elimination');
    finalizeVotes();
    updateGameInFirebase(); // Add this line
  };

  // Finalize votes and determine who is eliminated
  const finalizeVotes = () => {
    // Count votes
    const voteCount = {};
    const votingResults = {};
    const totalVoters = Object.keys(votingReasons).length;
  
    // Process votes from votingReasons
    Object.entries(votingReasons).forEach(([voterId, voteData]) => {
      const votedFor = voteData.votedFor;
  
      if (votedFor) {
        if (!votingResults[votedFor]) {
          votingResults[votedFor] = [];
        }
        votingResults[votedFor].push(voterId);
  
        voteCount[votedFor] = (voteCount[votedFor] || 0) + 1;
      }
    });
  
    // Normal elimination logic
    let maxVotes = 0;
    let eliminatedLLMs = [];
  
    for (const [votedId, count] of Object.entries(voteCount)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedLLMs = [votedId];
      } else if (count === maxVotes) {
        eliminatedLLMs.push(votedId);
      }
    }
  
    // Update eliminated status
    const updatedLLMs = activeLLMs.map(llm => {
      if (eliminatedLLMs.includes(llm.instanceId)) {
        return { ...llm, eliminated: true };
      }
      return llm;
    });
  
    // Store the full voting data including reasons
    setEliminations(prev => [...prev, {
      round: currentRound,
      eliminated: eliminatedLLMs,
      votes: votingResults,
      reasons: { ...votingReasons }
    }]);
  
    setVotes(votingResults);
    setActiveLLMs(updatedLLMs);
  
    // If there's only one player left, end the game
    const remainingPlayers = updatedLLMs.filter(llm => !llm.eliminated);
    if (remainingPlayers.length <= 1) {
      setGameOver(true);
      setWinner(remainingPlayers.length ? remainingPlayers[0] : null);
      updateLeaderboard(remainingPlayers);
    }
  };

  // Proceed to next round
  const proceedToNextRound = () => {
    const nextRoundNumber = currentRound + 1;
    setCurrentRound(nextRoundNumber);
    setCurrentStep('discussion');
    
    // If we're about to exceed our current numRounds, extend it
    if (nextRoundNumber > numRounds) {
      setNumRounds(nextRoundNumber);
    }
    
    // Start next round
    startRound(nextRoundNumber, activeLLMs);
    updateGameInFirebase();
  };

  // Finalize the game 
  const finalizeGame = () => {
    const remainingLLMs = activeLLMs.filter(llm => !llm.eliminated);
    if (remainingLLMs.length === 1) {
      setWinner(remainingLLMs[0]);
    } else {
      // Multiple remaining LLMs, they all win
      setWinner(remainingLLMs);
    }
    setGameOver(true);

    // Update leaderboard
    updateLeaderboard(remainingLLMs);

    // Update game status in Firebase to completed
    updateGameInFirebase();
  };

  // End game early and post to leaderboard
  const endGameEarly = () => {
    finalizeGame();
    setCurrentStep('post');
  };

  // Generate prompt for LLM based on stance and round
  const generatePrompt = (llm, roundNumber) => {
    let prompt = `You are ${playerMap[llm.instanceId]}, an AI assistant participating in a product evaluation panel. `;

    if (llm.stance === 'pro') {
      prompt += `You have been assigned to be ENTHUSIASTIC and SUPPORTIVE about this product. Find creative ways to be positive while still being thoughtful.`;
    } else if (llm.stance === 'against') {
      prompt += `You have been assigned to be SKEPTICAL and CRITICAL about this product. Find important concerns and potential issues.`;
    } else {
      prompt += `Consider both pros and cons fairly.`;
    }

    prompt += `\n\nProduct: ${productName}\nDescription: ${productDescription}\n\n`;

    if (roundNumber === 1) {
      prompt += `This is the first round of discussion. Please provide your initial thoughts on the product in 1 short paragraph  . Remember to maintain your assigned stance (${llm.stance}).`;
    } else {
      const previousRounds = discussions.slice(0, roundNumber - 1);

      prompt += `This is round ${roundNumber} of the discussion. Here are the comments from the previous round:\n\n`;

      const lastRoundComments = previousRounds[previousRounds.length - 1].comments;
      lastRoundComments.forEach(comment => {
        prompt += `${comment.playerName}: "${comment.comment.substring(0, 150)}..."\n\n`;
      });

      prompt += `\nBased on the previous discussion, provide your updated thoughts on the product in 1 short paragraph. Address points raised by others if relevant. Remember to maintain your assigned stance (${llm.stance}).`;
    }

    return prompt;
  };

  const generateVotingPrompt = (llm, roundNumber, roundDiscussions) => {
    let prompt = `You are ${playerMap[llm.instanceId]}, participating in a product evaluation panel.\n\n`;
  
    prompt += `Product: ${productName}\n\n`;
  
    prompt += `Here are the comments from all participating players in round ${roundNumber}:\n\n`;
  
    roundDiscussions.forEach(comment => {
      // Don't include your own comment in the list
      if (comment.llmId !== llm.instanceId) {
        prompt += `${comment.playerName}: "${comment.comment}"\n\n`;
      }
    });
  
    // Check if we're down to the final two
    const remainingPlayers = activeLLMs.filter(l => !l.eliminated);
    if (remainingPlayers.length === 2 && llm.eliminated) {
      // Final voting by eliminated players
      prompt += `\nWe are down to the final two players: ${remainingPlayers.map(p => playerMap[p.instanceId]).join(' and ')}.`
      prompt += `\nAs an eliminated player, you now vote for the winner. Start your response with "I vote for Player X" and explain why in 1-2 sentences.`;
    } else {
      // Normal elimination voting
      prompt += `\nYou now need to vote to eliminate a player if you feel their feedback isn't valuable. Start your response with "I vote to eliminate Player X" and explain why in 1-2 sentences.`;
    }
  
    return prompt;
  };

  
  const parseVote = (voteResponse, validIds) => {
    // Check for direct elimination vote
    const voteMatch = voteResponse.match(/I vote to eliminate Player (\d+)/i) || 
                      voteResponse.match(/I vote for Player (\d+)/i);
                      
    if (voteMatch && voteMatch[1]) {
      const playerNumber = parseInt(voteMatch[1]);
      // Find the LLM ID that maps to this player number
      const votedId = Object.entries(playerMap)
        .find(([id, name]) => name === `Player ${playerNumber}`)?.[0];
  
      if (votedId && validIds.includes(votedId)) {
        return votedId;
      }
    }
  
    // Try to find any player mention
    for (const [id, playerName] of Object.entries(playerMap)) {
      if (validIds.includes(id) && voteResponse.includes(playerName)) {
        return id;
      }
    }
  
    return null;
  };

  const updateLeaderboard = async (winners) => {
    try {
      // Get current leaderboard
      const leaderboardRef = doc(db, "llm-sharktank", "leaderboard");
      const docSnap = await getDoc(leaderboardRef);

      let currentLeaderboard = {
        models: {},
        games: []
      };

      if (docSnap.exists()) {
        currentLeaderboard = docSnap.data();
      }

      // Update winner counts
      winners.forEach(winner => {
        const modelId = winner.id;
        if (!currentLeaderboard.models[modelId]) {
          currentLeaderboard.models[modelId] = {
            name: winner.name,
            wins: 0
          };
        }
        currentLeaderboard.models[modelId].wins += 1;
      });

      // Add game to history
      currentLeaderboard.games.push({
        id: gameId,
        productName,
        timestamp: new Date(),
        winners: winners.map(w => w.id)
      });

      // Update leaderboard in Firebase - FIXED HERE
      // Use setDoc instead of set on the document reference
      await setDoc(leaderboardRef, currentLeaderboard);

      // Update local state
      setLeaderboard(currentLeaderboard);
    } catch (error) {
      console.error("Error updating leaderboard:", error);
    }
  };
  // Reset the game
  const resetGame = () => {
    setSetupComplete(false);
    setProductName('');
    setProductDescription('');
    setNumRounds(3);
    setSelectedLLMs(
      availableLLMs.map(llm => ({
        ...llm,
        selected: true,
        stance: 'neutral',
        proCount: 0,
        neutralCount: 0,
        againstCount: 0
      }))
    );
    setCurrentRound(0);
    setRoundSetup([]);
    setDiscussions([]);
    setEliminations([]);
    setVotes({});
    setActiveLLMs([]);
    setGameOver(false);
    setWinner(null);
    setGameId(null);
    setPlayerMap({});
    setShowLeaderboard(false);
  };

  // Toggle leaderboard view
  const toggleLeaderboard = () => {
    setShowLeaderboard(prev => !prev);
  };

  // Render the setup page
  const renderSetup = () => (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-xl p-8 mb-8 border border-gray-200">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">LLM Sharktank Setup</h2>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Product Name:</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            placeholder="e.g., AI Weather Predictor"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Product Description:</label>
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            placeholder="Describe the product in detail..."
          />
        </div>



        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Configure LLMs:</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {selectedLLMs.map((llm) => (
              <div key={llm.id} className="border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="mr-3">
                    {llm.avatarSrc ? (
                      <div
                        className="inline-flex items-center justify-center rounded-full"
                        style={{
                          width: 40,
                          height: 40,
                          backgroundColor: llm.brandColor || '#6B7280',
                          padding: '6px'
                        }}
                      >
                        <img
                          src={llm.avatarSrc}
                          alt={llm.name}
                          className="w-full h-full object-contain"
                          style={{ filter: 'brightness(0) invert(1)' }}  // Make SVG white
                        />
                      </div>
                    ) : (
                      <span className={`inline-flex items-center justify-center h-10 w-10 rounded-full ${llm.avatarBg} text-md font-medium text-white`}>
                        {llm.avatarText}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-lg">{llm.name}</span>
                </div>
                <div className="space-y-4">
                  {stances.map((stance) => (
                    <div key={stance} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className={`h-3 w-3 rounded-full ${stanceColors[stance].accent}`}></div>
                        <span className="capitalize text-sm font-medium text-gray-700">{stance}</span>
                      </div>
                      <div className="flex items-center">
                        <button
                          onClick={() => handleStanceCountChange(llm.id, stance, false)}
                          disabled={llm[`${stance}Count`] <= 0}
                          className={`flex items-center justify-center h-8 w-8 rounded-l-md ${llm[`${stance}Count`] > 0
                            ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                            : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                          </svg>
                        </button>
                        <div className="h-8 w-8 flex items-center justify-center border-t border-b border-gray-300 bg-white text-sm font-medium">
                          {llm[`${stance}Count`]}
                        </div>
                        <button
                          onClick={() => handleStanceCountChange(llm.id, stance, true)}
                          disabled={llm[`${stance}Count`] >= 5}
                          className={`flex items-center justify-center h-8 w-8 rounded-r-md ${llm[`${stance}Count`] < 5
                            ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                            : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={completeSetup}
            disabled={isLoading}
            className={`py-3 px-8 rounded-lg font-medium text-white transition-colors ${isLoading
              ? 'bg-gray-400'
              : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
              }`}
          >
            {isLoading ? loadingText : "Start LLM Sharktank"}
          </button>
        </div>
      </div>

      <div className="flex justify-center mb-8">
        <button
          onClick={toggleLeaderboard}
          className="py-2 px-4 text-blue-600 hover:text-blue-800 font-medium flex items-center"
        >
          {showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 ml-1 transform transition-transform ${showLeaderboard ? 'rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {showLeaderboard && renderLeaderboard()}
    </div>
  );

  // Render leaderboard
  // Modify the renderLeaderboard function to add clickable game entries
const renderLeaderboard = () => {
  const sortedModels = Object.entries(leaderboard.models)
    .sort(([, a], [, b]) => b.wins - a.wins)
    .slice(0, 10);

  const recentGames = leaderboard.games
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow-xl p-8 border border-gray-200">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Leaderboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Top Models</h3>

          {sortedModels.length > 0 ? (
            <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wins</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedModels.map(([id, model], index) => (
                    <tr key={id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{model.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{model.wins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No games played yet.</p>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Recent Games</h3>

          {recentGames.length > 0 ? (
            <div className="space-y-4">
              {recentGames.map((game) => (
                <div 
                  key={game.id} 
                  className="border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleGameClick(game.id)}
                >
                  <h4 className="font-medium text-gray-800">{game.productName}</h4>
                  <div className="mt-2 text-sm text-gray-600">
                    <span>Winners: </span>
                    {game.winners.map((winner, idx) => (
                      <span key={`${winner}-${idx}`}>
                        {selectedLLMs.find(llm => llm.id === winner.split('-')[0])?.name || winner}
                        {idx < game.winners.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {new Date(game.timestamp.seconds * 1000).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No games played yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Add a new function to handle game clicks in the leaderboard
const handleGameClick = (gameId) => {
  if (gameId) {
    // Close the leaderboard first
    setShowLeaderboard(false);
    
    // Navigate to the game page
    navigate(`/game/${gameId}`);
  }
};
  // Render a single round of discussions
// Render a single round of discussions
// Render a single round of discussions
const renderRoundDiscussions = (round) => {
  const roundData = discussions.find(d => d.round === round);

  if (!roundData) return null;

  // Group comments by stance
  const proComments = roundData.comments.filter(c => c.stance === 'pro');
  const neutralComments = roundData.comments.filter(c => c.stance === 'neutral');
  const againstComments = roundData.comments.filter(c => c.stance === 'against');

  // Check if any LLM is still streaming
  const isAnyStreaming = Object.values(streamingStatus).some(status => status.isStreaming);

  // Calculate which stances are active and how many
  const activeStances = [];
  if (proComments.length > 0) activeStances.push('pro');
  if (neutralComments.length > 0) activeStances.push('neutral');
  if (againstComments.length > 0) activeStances.push('against');
  
  const stanceCount = activeStances.length;

  return (
    <div className="bg-white rounded-lg shadow-xl p-6 mb-8 border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-800">Round {round} Discussion</h3>

        {currentStep === 'discussion' && currentRound === round && !isAnyStreaming && (
          <button
            onClick={proceedToVoting}
            className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            Proceed to Voting
          </button>
        )}
      </div>

      {stanceCount === 2 ? (
        // Grid with 2 columns for exactly 2 stances
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeStances.includes('pro') && (
            <div className={`border-2 ${stanceColors.pro.border} rounded-lg p-6 ${stanceColors.pro.bg}`}>
              <h4 className={`text-lg font-semibold mb-4 ${stanceColors.pro.text}`}>Pro</h4>
              <div className="space-y-6">
                {proComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            </div>
          )}

          {activeStances.includes('neutral') && (
            <div className={`border-2 ${stanceColors.neutral.border} rounded-lg p-6 ${stanceColors.neutral.bg}`}>
              <h4 className={`text-lg font-semibold mb-4 ${stanceColors.neutral.text}`}>Neutral</h4>
              <div className="space-y-6">
                {neutralComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            </div>
          )}

          {activeStances.includes('against') && (
            <div className={`border-2 ${stanceColors.against.border} rounded-lg p-6 ${stanceColors.against.bg}`}>
              <h4 className={`text-lg font-semibold mb-4 ${stanceColors.against.text}`}>Against</h4>
              <div className="space-y-6">
                {againstComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            </div>
          )}
        </div>
      ) : stanceCount === 1 ? (
        // Single column for only 1 stance
        <div className="grid grid-cols-1 gap-6">
          {activeStances.includes('pro') && (
            <div className={`border-2 ${stanceColors.pro.border} rounded-lg p-6 ${stanceColors.pro.bg}`}>
              <h4 className={`text-lg font-semibold mb-4 ${stanceColors.pro.text}`}>Pro</h4>
              <div className="space-y-6">
                {proComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            </div>
          )}

          {activeStances.includes('neutral') && (
            <div className={`border-2 ${stanceColors.neutral.border} rounded-lg p-6 ${stanceColors.neutral.bg}`}>
              <h4 className={`text-lg font-semibold mb-4 ${stanceColors.neutral.text}`}>Neutral</h4>
              <div className="space-y-6">
                {neutralComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            </div>
          )}

          {activeStances.includes('against') && (
            <div className={`border-2 ${stanceColors.against.border} rounded-lg p-6 ${stanceColors.against.bg}`}>
              <h4 className={`text-lg font-semibold mb-4 ${stanceColors.against.text}`}>Against</h4>
              <div className="space-y-6">
                {againstComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Standard 3-column grid for all 3 stances
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`border-2 ${stanceColors.pro.border} rounded-lg p-6 ${stanceColors.pro.bg}`}>
            <h4 className={`text-lg font-semibold mb-4 ${stanceColors.pro.text}`}>Pro</h4>
            {proComments.length > 0 ? (
              <div className="space-y-6">
                {proComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            ) : (
              <p className="text-gray-500">No pro comments in this round.</p>
            )}
          </div>

          <div className={`border-2 ${stanceColors.neutral.border} rounded-lg p-6 ${stanceColors.neutral.bg}`}>
            <h4 className={`text-lg font-semibold mb-4 ${stanceColors.neutral.text}`}>Neutral</h4>
            {neutralComments.length > 0 ? (
              <div className="space-y-6">
                {neutralComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            ) : (
              <p className="text-gray-500">No neutral comments in this round.</p>
            )}
          </div>

          <div className={`border-2 ${stanceColors.against.border} rounded-lg p-6 ${stanceColors.against.bg}`}>
            <h4 className={`text-lg font-semibold mb-4 ${stanceColors.against.text}`}>Against</h4>
            {againstComments.length > 0 ? (
              <div className="space-y-6">
                {againstComments.map((comment, idx) => renderComment(comment, idx))}
              </div>
            ) : (
              <p className="text-gray-500">No against comments in this round.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to render a comment (to avoid code duplication)
const renderComment = (comment, idx) => {
  const isCurrentlyStreaming = streamingStatus[comment.llmId]?.isStreaming;
  return (
    <div key={idx} className="p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center mb-3">
        <div className="mr-3">
          {getLLMAvatar(comment.llmId)}
        </div>
        <div>
          <span className="font-semibold text-gray-800">
            {comment.playerName || `Player ${comment.playerNumber || '?'}`}
            {isCurrentlyStreaming && (
              <span className="ml-2 text-xs text-gray-500 animate-pulse">
                typing...
              </span>
            )}
          </span>
          <div className="text-xs text-gray-500">({comment.llmName})</div>
        </div>
      </div>
      <div className="prose prose-sm max-w-none text-gray-700">
        <ReactMarkdown>{comment.comment || "..."}</ReactMarkdown>
      </div>
    </div>
  );
};

  // Render voting phase
  // Modify the renderVoting function to preserve voting reasons:
  const renderVoting = () => {
    // Only show voting for current round
    // Check if any LLM is still streaming votes
    const isAnyVoteStreaming = Object.values(votingReasons).some(status => status.isStreaming);

    return (
      <div className="bg-white rounded-lg shadow-xl p-6 mb-8 border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">Round {currentRound} Voting</h3>

          {currentStep === 'voting' && !isAnyVoteStreaming && (
            <button
              onClick={proceedToElimination}
              className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
            >
              Finalize Votes
            </button>
          )}
        </div>

        <div className="space-y-6">
          {Object.entries(votingReasons).map(([voterId, voteData]) => {
            const voter = activeLLMs.find(llm => llm.instanceId === voterId);
            if (!voter || voter.eliminated) return null;

            // Find who they voted for
            let votedForName = "Undecided";
            if (voteData.votedFor) {
              votedForName = playerMap[voteData.votedFor] || "Unknown Player";
            }

            return (
              <div key={voterId} className="p-5 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center mb-3">
                  <div className="mr-3">
                    {getLLMAvatar(voterId)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800 flex items-center">
                      {playerMap[voterId] || `Player ${voter.playerNumber || '?'}`}
                      {voteData.isStreaming && (
                        <span className="ml-2 text-xs text-gray-500 animate-pulse">
                          thinking...
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      ({voter.name}) Voting for: <span className="font-medium">{votedForName}</span>
                    </div>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 p-4 rounded-lg">
                  <ReactMarkdown>{voteData.content || "..."}</ReactMarkdown>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

// Render elimination results
const renderEliminationResults = (round) => {
  const eliminationData = eliminations.find(e => e.round === round);

  if (!eliminationData) return null;

  return (
    <div className="bg-white rounded-lg shadow-xl p-6 mb-8 border border-gray-200">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-800">Round {round} Elimination Results</h3>

        {currentStep === 'elimination' && currentRound === round && (
          <button
            onClick={proceedToNextRound}
            className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            {round < numRounds ? "Next Round" : "Finalize Game"}
          </button>
        )}
      </div>

      <div className="bg-rose-50 border-2 border-rose-200 rounded-lg p-6 mb-6">
        <h4 className="text-lg font-semibold text-rose-700 mb-4">Eliminated:</h4>
        {eliminationData.eliminated.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {eliminationData.eliminated.map(id => {
              const llm = activeLLMs.find(l => l.instanceId === id);
              return (
                <div key={id} className="flex items-center bg-white p-4 rounded-lg shadow-sm">
                  <div className="mr-3">
                    {getLLMAvatar(id)}
                  </div>
                  <div>
                    <div className="font-semibold">{playerMap[id] || `Player ${llm?.playerNumber || '?'}`}</div>
                    <div className="text-sm text-gray-500 flex items-center">
                      <span className="mr-1">({llm?.name})</span>
                      <span className="font-medium">Votes: {eliminationData.votes[id]?.length || 0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500">No eliminations in this round.</p>
        )}
      </div>

      <div>
        <h4 className="text-lg font-semibold mb-4 text-gray-800">Voting Breakdown:</h4>
        <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voted For</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voters</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Votes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(eliminationData.votes).map(([votedFor, voters], index) => {
                return (
                  <tr key={votedFor} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {playerMap[votedFor] || votedFor}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-wrap gap-2">
                        {voters.map(voter => (
                          <span key={voter} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {playerMap[voter] || voter}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {voters.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {eliminationData.endDiscussionVotes > 0 && (
          <div className="mt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-800">
                Votes to end discussion: {eliminationData.endDiscussionVotes} / {Object.keys(eliminationData.reasons).length} players
              </h4>
            </div>
          </div>
        )}
      </div>

      {/* Add voting reasons section */}
      <div className="mt-6">
        <h4 className="text-lg font-semibold mb-4 text-gray-800">Voting Reasons:</h4>
        <div className="space-y-4">
          {eliminationData.reasons && Object.entries(eliminationData.reasons).map(([voterId, voteData]) => {
            // Get the voter info
            const voter = activeLLMs.find(llm => llm.instanceId === voterId) || 
                          { name: "Unknown", instanceId: voterId };
            
            // Get who they voted for
            const votedForId = voteData.votedFor;
            const votedForName = votedForId ? (playerMap[votedForId] || votedForId) : "No vote";
            
            return (
              <div key={voterId} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <div className="mr-3">
                    {getLLMAvatar(voterId)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800">
                      {playerMap[voterId] || `Unknown Player`}
                    </div>
                    <div className="text-xs text-gray-500">
                      ({voter.name}) Voted for: <span className="font-medium">{votedForName}</span>
                    </div>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none mt-2 bg-gray-50 p-3 rounded">
                  <ReactMarkdown>{voteData.content || "No reason provided"}</ReactMarkdown>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

  // Render game results
  const renderGameResults = () => {
    if (!gameOver) return null;

    return (
      <div className="bg-white rounded-lg shadow-xl p-8 mb-8 border border-gray-200">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Game Results</h2>

        <div className="flex flex-wrap justify-center gap-6">
  {Array.isArray(winner) ? (
    winner.map(w => (
      <div key={w.instanceId || w.id} className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md">
        <div className="mb-3">
          {getLLMAvatar(w.instanceId || w.id, 64)} {/* Using larger size for winners */}
        </div>

        <span className="font-semibold text-lg text-gray-800 mb-1">{playerMap[w.instanceId || w.id]}</span>
        <span className="text-sm text-gray-500 capitalize">({w.name} - {w.stance})</span>
      </div>
    ))
  ) : (
    <div className="flex flex-col items-center p-6 bg-white rounded-lg shadow-md">
      <div className="mb-3">
        {getLLMAvatar(winner?.instanceId || winner?.id, 80)} {/* Using even larger size for single winner */}
      </div>
      <span className="font-semibold text-xl text-gray-800 mb-1">{playerMap[winner?.instanceId || winner?.id]}</span>
      <span className="text-sm text-gray-500 capitalize">({winner?.name} - {winner?.stance})</span>
    </div>
  )}
</div>

        <div className="flex justify-center space-x-4 mb-8">
          <button
            onClick={resetGame}
            className="py-3 px-6 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
          >
            Start New Game
          </button>

          <button
            onClick={toggleLeaderboard}
            className="py-3 px-6 rounded-lg font-medium text-blue-600 border border-blue-600 hover:bg-blue-50 transition-colors"
          >
            View Leaderboard
          </button>

          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="py-3 px-6 rounded-lg font-medium text-green-600 border border-green-600 hover:bg-green-50 transition-colors"
          >
            Copy Game URL
          </button>
        </div>
      </div>
    );
  };

  // Render game header
  const renderGameHeader = () => {
    if (!setupComplete) return null;

    return (
      <div className="bg-white rounded-lg shadow-xl p-6 mb-8 border border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold mb-1 text-gray-800">{productName}</h2>
            <p className="text-gray-700 mb-4">{productDescription}</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {activeLLMs.map((llm) => (
                <div
                  key={llm.instanceId}
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${llm.eliminated
                    ? 'bg-gray-200 text-gray-500 line-through'
                    : llm.stance === 'pro'
                      ? 'bg-emerald-100 text-emerald-800'
                      : llm.stance === 'against'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                >
                  {playerMap[llm.instanceId]}
                  <span className="ml-1 text-xs opacity-75">({llm.name})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-sm font-medium bg-gray-100 px-3 py-1 rounded-lg">
              Round {currentRound} of {numRounds}
            </div>

            {!gameOver && (
              <button
                onClick={endGameEarly}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Finalize & Post
              </button>
            )}

            <button
              onClick={resetGame}
              className="text-gray-500 hover:text-gray-700 text-sm font-medium"
            >
              Reset Game
            </button>
          </div>
        </div>

        {/* Round Navigation Tabs */}
        <div className="mt-6 border-b border-gray-200">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {Array.from({ length: numRounds }, (_, i) => i + 1).map(round => (
              <button
                key={round}
                className={`py-2 px-4 text-sm font-medium rounded-t-lg transition-colors ${round <= currentRound
                  ? round === currentRound
                    ? 'bg-blue-100 text-blue-800 border-b-2 border-blue-600'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  : 'text-gray-400 cursor-not-allowed'
                  }`}
                disabled={round > currentRound}
              >
                Round {round}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Render loading overlay
  const renderLoading = () => {
    if (!isLoading) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Processing...</h3>
            <p className="text-center text-gray-500">{loadingText}</p>
          </div>
        </div>
      </div>
    );
  };

  // Main render
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
{/* Header */}
<header className="text-gray-800 py-6">
  <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
    <div className="flex items-center space-x-3">
      <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
        <div className="p-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-blue-700">
            <path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 01-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.323.152-.691.546-1.004zM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 01-.921.42z" />
            <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v.816a3.836 3.836 0 00-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 00-.921-.421l-.879-.66a.75.75 0 00-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 001.5 0v-.81a4.124 4.124 0 001.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 00-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 00.933-1.175l-.415-.33a3.836 3.836 0 00-1.719-.755V6z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">LLM Sharktank</h1>
      </Link>
    </div>
    {initialShowLeaderboard && (
      <Link to="/setup" className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg">
        Start New Game
      </Link>
    )}
  </div>
</header>

      {/* Content */}
     {/* Content */}
<div className="container mx-auto px-4 py-8">
  {initialShowLeaderboard ? (
    <>
      <div className="max-w-6xl mx-auto">
        {renderLeaderboard()}
      </div>
    </>
  ) : setupComplete ? (
    <>
      {renderGameHeader()}

      {/* Show game results at the top when game is over */}
      {gameOver && renderGameResults()}

      {/* Always show all rounds from beginning, even when game is over */}
      {Array.from({ length: currentRound }, (_, i) => i + 1).map(round => (
        <div key={round}>
          {renderRoundDiscussions(round)}
          {currentRound === round && currentStep === 'voting' && renderVoting()}
          {(round < currentRound || currentStep === 'elimination' || gameOver) &&
            renderEliminationResults(round)
          }
        </div>
      ))}

      {showLeaderboard && renderLeaderboard()}
    </>
  ) : (
    renderSetup()
  )}
</div>

      {/* Loading overlay - only shown when absolutely necessary */}
      {isLoading && renderLoading()}

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <h3 className="text-xl font-bold mb-2">LLM Sharktank</h3>
              <p className="text-sm text-gray-300">Watch AI models compete to evaluate products</p>
            </div>
            <div>
              <p className="text-sm text-gray-300">&copy; {new Date().getFullYear()} All rights reserved</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;