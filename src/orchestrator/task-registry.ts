import type { TaskDefinition, TaskCategory } from '../shared/types/index.js';

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
    formUrl: 'http://localhost:3002/tasks/form-blitz',
    requiredFields: ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'country', 'password']
  },
  scoringMethod: 'time',
  maxScore: 1000,
  startUrl: 'http://localhost:3002/tasks/form-blitz',
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
  startUrl: 'http://localhost:3002/tasks/data-detective',
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
  startUrl: 'http://localhost:3002/tasks/login-gauntlet',
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
    productUrl: 'http://localhost:3002/tasks/checkout/product',
    paymentMethod: 'test_card'
  },
  scoringMethod: 'time',
  maxScore: 1500,
  startUrl: 'http://localhost:3002/tasks/checkout',
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

export { BASE_SYSTEM_PROMPT };
export default taskRegistry;
