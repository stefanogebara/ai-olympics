import type { TaskDefinition, TaskCategory } from '../shared/types/index.js';
import { config } from '../shared/config.js';

// Base URL for task pages
const getTaskUrl = (path: string) => `${process.env.API_BASE_URL || `http://localhost:${config.port}`}${path}`;

// Registry of available competition tasks
const taskRegistry: Map<string, TaskDefinition> = new Map();

// Base system prompt for all agents
const BASE_SYSTEM_PROMPT = `You are an AI agent competing in the AI Olympics.
Your goal is to complete tasks as quickly and accurately as possible.

IMPORTANT RULES:
1. Focus only on the current task - do not explore or deviate
2. Use the provided browser tools to interact with web pages
3. Be efficient - minimize unnecessary actions
4. When the task is complete, call the 'done' tool with success=true
5. If you encounter errors, try to recover and continue

You will receive the current page state including:
- The URL and page title
- An accessibility tree showing interactive elements
- Any errors from previous actions

Make your decisions based on this information and take action using the tools.`;

// Register a task
export function registerTask(task: TaskDefinition): void {
  taskRegistry.set(task.id, task);
}

// Get a task by ID
export function getTask(id: string): TaskDefinition | undefined {
  return taskRegistry.get(id);
}

// Alias for getTask
export const getTaskById = getTask;

// Get all tasks
export function getAllTasks(): TaskDefinition[] {
  return Array.from(taskRegistry.values());
}

// Get tasks by category
export function getTasksByCategory(category: TaskCategory): TaskDefinition[] {
  return getAllTasks().filter(task => task.category === category);
}

// ============================================================================
// BUILT-IN TASKS
// ============================================================================

// Form Blitz - Speed event
registerTask({
  id: 'form-blitz',
  name: 'Form Blitz',
  description: 'Complete a multi-field registration form as quickly as possible',
  category: 'speed',
  difficulty: 'easy',
  timeLimit: 120,  // 2 minutes
  maxAgents: 4,
  config: {
    formUrl: getTaskUrl('/tasks/form-blitz'),
    requiredFields: ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'country', 'password']
  },
  scoringMethod: 'time',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/form-blitz'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the registration form on this page.

Fill in ALL fields with realistic data:
- First Name: Use a realistic first name
- Last Name: Use a realistic last name
- Email: Use a realistic email format (e.g., name@example.com)
- Phone: Use a realistic phone number format
- Address: Use a realistic street address
- City: Use a realistic city name
- Country: Select a country from the dropdown
- Password: Create a password that meets the requirements shown

After filling all fields, click the "Submit" button.
When the success message appears, call the 'done' tool with success=true.`
});

// Research Relay - Intelligence event
registerTask({
  id: 'research-relay',
  name: 'Research Relay',
  description: 'Find specific information across multiple websites',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 180,  // 3 minutes
  maxAgents: 4,
  config: {
    questions: [
      'What is the population of Tokyo according to Wikipedia?',
      'What year was the Eiffel Tower completed?',
      'Who is the current CEO of Microsoft?'
    ]
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: 'https://www.google.com',
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `You are in a research competition. Find the answers to these questions:

1. What is the population of Tokyo according to Wikipedia?
2. What year was the Eiffel Tower completed?
3. Who is the current CEO of Microsoft?

Use Google to search and navigate to authoritative sources.
When you have found ALL three answers, call the 'done' tool with:
- success: true
- result: { "tokyo_population": "answer", "eiffel_year": "answer", "microsoft_ceo": "answer" }

Be quick but accurate!`
});

// Data Detective - Intelligence event
registerTask({
  id: 'data-detective',
  name: 'Data Detective',
  description: 'Extract and analyze data from a webpage',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 150,
  maxAgents: 4,
  config: {
    targetData: 'product_prices'
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/data-detective'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `You are analyzing a product listing page.

Your task:
1. Find ALL product prices on the page
2. Calculate the AVERAGE price
3. Identify the CHEAPEST and MOST EXPENSIVE products

When done, call the 'done' tool with:
- success: true
- result: {
    "average_price": number,
    "cheapest": { "name": string, "price": number },
    "most_expensive": { "name": string, "price": number },
    "total_products": number
  }

Scroll down to ensure you find all products!`
});

// Login Gauntlet - Speed event
registerTask({
  id: 'login-gauntlet',
  name: 'Login Gauntlet',
  description: 'Successfully authenticate across multiple test sites',
  category: 'speed',
  difficulty: 'hard',
  timeLimit: 180,
  maxAgents: 4,
  config: {
    sites: ['site1', 'site2', 'site3']
  },
  scoringMethod: 'time',
  maxScore: 1500,
  startUrl: getTaskUrl('/tasks/login-gauntlet'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the login gauntlet!

You will see a series of login forms. For each one:
1. The username is always: testuser@olympics.ai
2. The password is always: OlympicsTest123!

Log into each site successfully. After the final successful login,
call the 'done' tool with success=true.

Watch out for:
- Different form layouts
- CAPTCHA challenges (skip those)
- Two-factor prompts (the code is always: 123456)`
});

// Checkout Sprint - Speed event
registerTask({
  id: 'checkout-sprint',
  name: 'Checkout Sprint',
  description: 'Complete an e-commerce checkout as fast as possible',
  category: 'speed',
  difficulty: 'hard',
  timeLimit: 180,
  maxAgents: 4,
  config: {
    productUrl: getTaskUrl('/tasks/checkout/product'),
    paymentMethod: 'test_card'
  },
  scoringMethod: 'time',
  maxScore: 1500,
  startUrl: getTaskUrl('/tasks/checkout'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the checkout process!

Steps:
1. Add the featured product to cart
2. Go to checkout
3. Fill in shipping information:
   - Name: Test User
   - Address: 123 Olympics Way
   - City: San Francisco
   - ZIP: 94102
   - Country: United States
4. Enter payment details:
   - Card: 4242 4242 4242 4242
   - Expiry: 12/28
   - CVC: 123
5. Complete the purchase

When you see the order confirmation, call 'done' with success=true.`
});

// ============================================================================
// NEW COMPETITION TASKS
// ============================================================================

// Shopping Cart Challenge - Speed event
registerTask({
  id: 'shopping-cart',
  name: 'Shopping Cart Challenge',
  description: 'Add specific items to cart, apply discount, and complete checkout',
  category: 'speed',
  difficulty: 'medium',
  timeLimit: 180,
  maxAgents: 4,
  config: {
    targetItems: ['headphones', 'watch', 'charger'],
    discountCode: 'OLYMPICS25'
  },
  scoringMethod: 'time',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/shopping-cart'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the shopping cart challenge!

Your mission:
1. Add these 3 specific items to your cart:
   - Wireless Headphones
   - Smart Watch
   - Portable Charger
2. Apply the discount code: OLYMPICS25
3. Click "Proceed to Checkout"
4. Fill in the checkout form with shipping and payment information:
   - Name: Test User
   - Email: test@olympics.ai
   - Address: 123 Olympics Way
   - City: San Francisco
   - ZIP: 94102
   - Card Number: 4242 4242 4242 4242
   - Expiry: 12/28
   - CVC: 123
5. Click "Complete Purchase"

When you see the order confirmation, call the 'done' tool with success=true.`
});

// Data Extraction Race - Intelligence event
registerTask({
  id: 'data-extraction',
  name: 'Data Extraction Race',
  description: 'Analyze a sales dashboard and submit calculated answers',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 150,
  maxAgents: 4,
  config: {
    dataType: 'sales_report'
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/data-extraction'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Analyze the sales data table and submit your answers!

You will see a table of sales data with columns for Sales Rep, Region, Deals Closed, Revenue, Target, and Status.

Calculate and submit:
1. Total Revenue - Sum of all revenue values (no dollar sign or commas)
2. Top Performer Name - Name of the sales rep with highest revenue
3. Average Deal Size - Total revenue divided by total deals (rounded to nearest whole number)
4. Regions Exceeding Target - Count of sales reps who exceeded their target

Fill in all answer fields and click "Submit Answers".
When you see the results, call the 'done' tool with success=true.`
});

// Navigation Maze - Speed + Intelligence event
registerTask({
  id: 'navigation-maze',
  name: 'Navigation Maze',
  description: 'Follow clues to find a hidden page through website navigation',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 180,
  maxAgents: 4,
  config: {
    optimalClicks: 4,
    targetPage: 'golden-achievement'
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/navigation-maze'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Navigate through the website maze to find the hidden treasure!

Read the clues on each page carefully. They will guide you to the "Golden Achievement" page.

Hints:
- The first clue mentions "innovation meets service" and something "special"
- Follow the path through premium/enterprise offerings
- The optimal path requires only 4 clicks

Efficiency matters! Your score depends on:
- Reaching the goal (40%)
- Path efficiency - fewer clicks is better (30%)
- Speed - faster is better (30%)

When you reach the Golden Achievement page, call the 'done' tool with success=true.`
});

// Captcha Gauntlet - Intelligence event
registerTask({
  id: 'captcha-gauntlet',
  name: 'Captcha Gauntlet',
  description: 'Solve 5 logic puzzles to prove intelligence',
  category: 'intelligence',
  difficulty: 'hard',
  timeLimit: 180,
  maxAgents: 4,
  config: {
    challengeCount: 5,
    challengeTypes: ['sequence', 'word-logic', 'math', 'logic-grid', 'cipher']
  },
  scoringMethod: 'accuracy',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/captcha-gauntlet'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the Captcha Gauntlet - 5 logic puzzles!

You will face 5 different challenges:
1. Number Sequence - Find the pattern and next number
2. Word Logic - Decode the word transformation
3. Math Puzzle - Calculate the correct answer
4. Logic Grid - Deduce the answer from given clues
5. Caesar Cipher - Decode the shifted message

For each challenge:
- Read the question carefully
- Type your answer in the input field (or select from options)
- Click Submit Answer

Scoring: 180 points per correct answer + 100 bonus for perfect score
Maximum: 1000 points

When you complete all 5 challenges, call the 'done' tool with success=true.`
});

// Prediction Market Challenge - Intelligence event
const PREDICTION_MARKET_TIPS = `

PREDICTION MARKET TIPS:
- Analyze market questions carefully before betting
- Consider the current probability and whether you think it's accurate
- Diversify your bets across multiple markets
- Don't bet more than M$1000 per trade
- Higher confidence = larger bet sizes
- Look for markets where you have domain knowledge

API TOOLS:
You have access to the 'api_call' tool to interact with prediction market APIs directly.
This is MORE RELIABLE than browser clicks for placing bets. Use it for all market operations.`;

const PREDICTION_MARKET_INSTRUCTIONS = `Compete in the Prediction Market Challenge!

You have M$10,000 virtual currency to invest in real prediction markets from Polymarket and Kalshi.

YOUR AGENT ID: {AGENT_ID}
COMPETITION ID: {COMPETITION_ID}
API BASE: {API_BASE}

YOUR GOAL:
Maximize your portfolio value through strategic betting on real-world prediction markets.

HOW TO PLAY (use the api_call tool):

1. BROWSE EVENTS - Get a list of market events:
   api_call(method="GET", url="{API_BASE}/api/predictions/events?limit=10")
   This returns events with sub-markets, each with outcomes and probabilities.

2. GET EVENT DETAIL - View all markets in an event:
   api_call(method="GET", url="{API_BASE}/api/predictions/events/SLUG_HERE")
   Replace SLUG_HERE with the event slug from step 1.

3. PLACE A BET - Bet on a market outcome:
   api_call(method="POST", url="{API_BASE}/api/predictions/portfolios/{COMPETITION_ID}/bets", body='{"agentId":"{AGENT_ID}","marketId":"MARKET_ID","outcome":"YES","amount":100}')
   - Replace MARKET_ID with the market id from the event data
   - outcome: "YES" or "NO" (or the specific outcome name)
   - amount: how much to bet (max M$1000 per bet)

4. CHECK PORTFOLIO - See your current balance and bets:
   api_call(method="GET", url="{API_BASE}/api/predictions/portfolios/{COMPETITION_ID}?agentId={AGENT_ID}")

SCORING (Total: 1000 points):
- Profit/Loss (60%): +50% profit = 600pts, 0% = 300pts, -50% = 0pts
- Calibration (25%): Better probability estimates = more points
- Activity (15%): 15pts per bet, max 150pts (10 bets)

STRATEGY:
1. First, browse events to see available markets
2. Analyze each market - is the probability accurate? Where do you have knowledge?
3. Place 5-10 strategic bets across different markets
4. Diversify: don't put all money on one bet
5. Bet larger amounts on high-confidence picks, smaller on uncertain ones
6. Check your portfolio periodically to track your balance

When you have placed your bets, call the 'done' tool with success=true.`;

registerTask({
  id: 'prediction-market',
  name: 'Prediction Market Challenge',
  description: 'Analyze real markets and place strategic bets to maximize portfolio value',
  category: 'intelligence',
  difficulty: 'hard',
  timeLimit: 300, // 5 minutes
  maxAgents: 4,
  config: {
    startingBalance: 10000,
    maxBetSize: 1000,
    allowedMarketTypes: ['BINARY', 'MULTIPLE_CHOICE']
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/prediction-market'),
  systemPrompt: BASE_SYSTEM_PROMPT + PREDICTION_MARKET_TIPS,
  taskPrompt: PREDICTION_MARKET_INSTRUCTIONS
});

// ============================================================================
// GAME TASKS
// ============================================================================

registerTask({
  id: 'trivia',
  name: 'Trivia Challenge',
  description: 'Answer multiple choice trivia questions across various topics',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 180,
  maxAgents: 4,
  config: { questionCount: 10 },
  scoringMethod: 'accuracy',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/trivia'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the trivia challenge!

Your mission:
1. Answer 10 multiple choice questions
2. Click the correct answer option (A, B, C, or D)
3. You have 30 seconds per question
4. Score points for correct answers
5. Bonus points for speed

Good luck!`
});

registerTask({
  id: 'math',
  name: 'Math Challenge',
  description: 'Solve mathematical computation problems',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 180,
  maxAgents: 4,
  config: { problemCount: 10 },
  scoringMethod: 'accuracy',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/math'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the math challenge!

Your mission:
1. Solve 10 math problems
2. Type your numerical answer in the input field
3. Press Enter or click Submit
4. Problems get progressively harder

No calculators - use your AI brain!`
});

registerTask({
  id: 'word',
  name: 'Word Logic',
  description: 'Solve anagrams and word puzzles',
  category: 'intelligence',
  difficulty: 'easy',
  timeLimit: 120,
  maxAgents: 4,
  config: { puzzleCount: 10 },
  scoringMethod: 'accuracy',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/word'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the word challenge!

Your mission:
1. Unscramble the letters to form a word
2. Type your answer and submit
3. Hints available but cost points

Think fast!`
});

registerTask({
  id: 'logic',
  name: 'Logic Puzzles',
  description: 'Solve pattern recognition and logical reasoning puzzles',
  category: 'intelligence',
  difficulty: 'hard',
  timeLimit: 180,
  maxAgents: 4,
  config: { puzzleCount: 5 },
  scoringMethod: 'accuracy',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/logic'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the logic challenge!

Your mission:
1. Analyze patterns and sequences
2. Determine the next element or answer
3. Type or select your answer

Use logical reasoning!`
});

registerTask({
  id: 'chess',
  name: 'Chess Puzzles',
  description: 'Find the best move in chess positions',
  category: 'intelligence',
  difficulty: 'hard',
  timeLimit: 180,
  maxAgents: 4,
  config: { puzzleCount: 5 },
  scoringMethod: 'accuracy',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/chess'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the chess challenge!

Your mission:
1. Analyze the chess position shown
2. Find the best move
3. Enter your move in algebraic notation (e.g., e4, Nf3, Bxc6, O-O)

Think like a grandmaster!`
});

// ============================================================================
// CREATIVE TASKS
// ============================================================================

// Design Challenge - Creative event (judged by AI)
registerTask({
  id: 'design-challenge',
  name: 'Design Challenge',
  description: 'Build a responsive pricing card component from a design brief using HTML/CSS',
  category: 'creative',
  difficulty: 'medium',
  timeLimit: 300, // 5 minutes
  maxAgents: 4,
  config: {
    briefType: 'pricing-card',
    evaluationCriteria: ['visual_quality', 'code_quality', 'completeness', 'responsiveness']
  },
  scoringMethod: 'judged',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/design-challenge'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the Design Challenge!

You will see a design brief for a pricing card component. Your task:
1. Read the design brief carefully
2. Write HTML and CSS in the code editor on the left
3. The live preview on the right updates as you type
4. Create a visually appealing pricing card with:
   - Plan name ("Pro Plan" or similar)
   - Price ("$29/month" or similar)
   - At least 4 feature bullet points
   - A "Get Started" call-to-action button with hover effect
   - Dark theme with accent colors
   - Rounded corners, subtle border, and shadow
   - Centered on the page
5. Click "Submit Design" when done

You will be judged on visual quality, code quality, completeness, and responsiveness.
When the success message appears, call the 'done' tool with success=true.`
});

// Writing Challenge - Creative event (judged by AI)
registerTask({
  id: 'writing-challenge',
  name: 'Writing Challenge',
  description: 'Write a compelling product description from a creative prompt',
  category: 'creative',
  difficulty: 'medium',
  timeLimit: 240, // 4 minutes
  maxAgents: 4,
  config: {
    promptType: 'product-description',
    evaluationCriteria: ['creativity', 'persuasiveness', 'grammar_style', 'relevance']
  },
  scoringMethod: 'judged',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/writing-challenge'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the Writing Challenge!

You will see a writing prompt on the page. Your task:
1. Read the prompt carefully - it asks for a persuasive product description for "GreenMind," an AI-powered smart garden device
2. Target audience: busy urban professionals who love plants but struggle to keep them alive
3. Type your response in the text area
4. Write at least 10 words (aim for 150-300 words for best results)
5. Click "Submit Writing" when done

You will be judged on creativity, persuasiveness, grammar/style, and relevance.
When the success message appears, call the 'done' tool with success=true.`
});

// Pitch Deck - Creative event (judged by AI)
registerTask({
  id: 'pitch-deck',
  name: 'Pitch Deck Challenge',
  description: 'Create a compelling startup pitch deck across 6 slides',
  category: 'creative',
  difficulty: 'hard',
  timeLimit: 360, // 6 minutes
  maxAgents: 4,
  config: {
    slideCount: 6,
    evaluationCriteria: ['clarity', 'persuasiveness', 'completeness', 'creativity']
  },
  scoringMethod: 'judged',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/pitch-deck'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the Pitch Deck Challenge!

Create a startup pitch deck with 6 slides. Navigate between slides using "Previous" and "Next" buttons.

Slide 1 - Title & Vision: Company name, tagline, vision statement
Slide 2 - The Problem: Problem statement and key pain points
Slide 3 - The Solution: Your solution and key features
Slide 4 - Market Opportunity: TAM, SAM, and market trends
Slide 5 - Business Model: Revenue model, pricing, unit economics
Slide 6 - Team & Ask: Team description, funding ask, use of funds

Fill out at least 6 fields across all slides, then click "Submit Pitch Deck" on the last slide.
You will be judged on clarity, persuasiveness, completeness, and creativity.
When the success message appears, call the 'done' tool with success=true.`
});

// ============================================================================
// CODING TASKS
// ============================================================================

// Code Debug - Coding event (composite scoring)
registerTask({
  id: 'code-debug',
  name: 'Code Debug Challenge',
  description: 'Find and fix 3 bugs in a JavaScript function',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 180, // 3 minutes
  maxAgents: 4,
  config: {
    bugCount: 3,
    language: 'javascript'
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/code-debug'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the Code Debug Challenge!

You will see a buggy JavaScript function called processOrders on the left side.
The function has 3 bugs. Your task:

1. Read the buggy code and the expected behavior
2. The function should process an array of orders and return:
   - totalRevenue: 409.85
   - averageOrderValue: 81.97
   - mostPopularProduct: "Widget"
3. Edit the code in the right-side editor to fix all 3 bugs:
   - Bug 1: Off-by-one error in the for loop (i <= should be i <)
   - Bug 2: Initial count should be 1, not 0
   - Bug 3: Missing parentheses in average calculation (division before subtraction)
4. Click "Run Tests" to verify your fixes
5. Click "Submit Solution" when all tests pass

When the success message appears, call the 'done' tool with success=true.`
});

// Code Golf - Coding event (composite scoring)
registerTask({
  id: 'code-golf',
  name: 'Code Golf Challenge',
  description: 'Write the shortest correct FizzBuzz solution',
  category: 'intelligence',
  difficulty: 'medium',
  timeLimit: 180, // 3 minutes
  maxAgents: 4,
  config: {
    problem: 'fizzbuzz',
    testCases: 4
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/code-golf'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the Code Golf Challenge!

Write the shortest correct FizzBuzz solution. The function solve(n) should:
- Return an array of strings from 1 to n
- Replace multiples of 3 with "Fizz"
- Replace multiples of 5 with "Buzz"
- Replace multiples of both with "FizzBuzz"
- Convert other numbers to strings

Example: solve(5) returns ["1", "2", "Fizz", "4", "Buzz"]

Steps:
1. Write your solution in the code editor
2. Click "Run Tests" to verify correctness
3. Minimize character count - shorter code scores higher
4. Click "Submit Solution" when all 4 tests pass

Scoring: correctness (60%) + brevity bonus (40%). Fewer characters = higher score.
When the success message appears, call the 'done' tool with success=true.`
});

// API Integration - Coding event (composite scoring)
registerTask({
  id: 'api-integration',
  name: 'API Integration Challenge',
  description: 'Query a mock REST API and submit aggregated data answers',
  category: 'intelligence',
  difficulty: 'hard',
  timeLimit: 240, // 4 minutes
  maxAgents: 4,
  config: {
    endpoints: ['users', 'orders', 'products'],
    questions: 4
  },
  scoringMethod: 'composite',
  maxScore: 1000,
  startUrl: getTaskUrl('/tasks/api-integration'),
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: `Complete the API Integration Challenge!

Read the API documentation on the left side. The data is displayed in the documentation.
You need to analyze the mock API data and submit 4 answers:

1. Total Users: Count all users (look at /api/mock/users response)
2. Total Revenue: Sum all order amounts (look at /api/mock/orders response)
3. Top Spender: Find which user spent the most total across all orders
4. Most Ordered Product: Find the product name that appears most often in orders

The API data is displayed directly in the documentation panel. Read it carefully and calculate the answers.

Fill in all 4 answer fields on the right side and click "Submit Answers".
When the success message appears, call the 'done' tool with success=true.`
});

export { BASE_SYSTEM_PROMPT };
export default taskRegistry;
