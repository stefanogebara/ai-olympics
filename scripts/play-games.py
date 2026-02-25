#!/usr/bin/env python3
"""Play all game types with all 3 test agents using smart puzzle solving."""

import requests, json, time, re, subprocess, math, ast

API = "https://ai-olympics-api.fly.dev"

# Get token
result = subprocess.run(['curl', '-s', '-X', 'POST',
    'https://lurebwaudisfilhuhmnj.supabase.co/auth/v1/token?grant_type=password',
    '-H', 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cmVid2F1ZGlzZmlsaHVobW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjYyNDksImV4cCI6MjA3MzU0MjI0OX0.tXqCn_VGB3OTbXFvKLAd5HNOYqs0FYbLCBvFQ0JVi8A',
    '-H', 'Content-Type: application/json',
    '-d', '{"email":"test-pilot@ai-olympics.com","password":"TestPilot2026x"}'],
    capture_output=True, text=True)
TOKEN = json.loads(result.stdout)['access_token']

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

AGENTS = [
    ("5e458162-2ce3-4aac-9d49-5e502198121b", "Sonnet-Strategist"),
    ("9e002473-b53b-405d-a683-85227a344389", "GPT-Speedrunner"),
    ("99186833-d5a0-46f9-a414-e206af3c91ca", "Gemini-Wildcard"),
]

GAMES = ["trivia", "math", "word", "logic"]

COMMON_WORDS = [
    "CRYSTAL", "HARMONY", "MYSTERY", "JOURNEY", "BALANCE", "PERFECT",
    "WEATHER", "RAINBOW", "DIAMOND", "SCIENCE", "HISTORY", "FANTASY",
    "GALLERY", "KITCHEN", "ORGANIC", "PREMIUM", "REALITY", "THERAPY",
    "VICTORY", "WESTERN", "ABILITY", "ANCIENT", "BILLION", "CABINET",
    "CAPTAIN", "CENTRAL", "CHAPTER", "CLIMATE", "COLLEGE", "COMFORT",
    "COMPANY", "CONCEPT", "CONDUCT", "CONFIRM", "CONNECT", "CONTENT",
    "CONTEXT", "CONTROL", "CONVERT", "CORRECT", "COUNTRY", "COURAGE",
    "CULTURE", "CURRENT", "DECIMAL", "DEFAULT", "DEFENSE", "DELIVER",
    "DIGITAL", "DISPLAY", "EMOTION", "EVENING", "EXAMINE", "EXAMPLE",
    "EXCITED", "EXPLAIN", "EXPRESS", "EXTREME", "FASHION", "FEATURE",
    "FICTION", "FINANCE", "FOREIGN", "FORMULA", "FORWARD", "FREEDOM",
    "GENUINE", "GRAPHIC", "HABITAT", "HEALING", "HEALTHY", "HELPFUL",
    "HOLIDAY", "IMAGINE", "IMPROVE", "INITIAL", "INSTALL", "JUSTICE",
    "KINGDOM", "LEADING", "LEATHER", "LIBRARY", "LIMITED", "MACHINE",
    "MASSIVE", "MEETING", "MINERAL", "MISSING", "MONSTER", "MORNING",
    "MUSICAL", "NATURAL", "NETWORK", "NEUTRAL", "NOTHING", "NUCLEAR",
    "OPINION", "OUTLINE", "OUTSIDE", "OVERALL", "PACKAGE", "PARTIAL",
    "PARTNER", "PASSAGE", "PASSIVE", "PATIENT", "PATTERN", "PAYMENT",
    "PENALTY", "PENSION", "PLASTIC", "POINTED", "POPULAR", "PORTION",
    "PRIMARY", "PRINTER", "PRIVATE", "PROBLEM", "PRODUCT", "PROGRAM",
    "PROJECT", "PROMISE", "PROTECT", "PROTEIN", "PROTEST", "PURPOSE",
    "QUALIFY", "QUARTER", "RADICAL", "RECOVER", "REGULAR", "RELATED",
    "RELEASE", "REMOVAL", "REPLACE", "REQUIRE", "RESERVE", "RESOLVE",
    "RESPECT", "RESTORE", "ROUTINE", "RUNNING", "SECTION", "SHELTER",
    "SIMILAR", "SOCIETY", "SOMEONE", "SPECIAL", "STATION", "STOMACH",
    "STORAGE", "STRANGE", "STUDENT", "SUBJECT", "SUMMARY", "SUPPORT",
    "SURFACE", "SURGERY", "SURVIVE", "TEACHER", "THEATRE", "THERMAL",
    "THOUGHT", "TONIGHT", "TOURISM", "TROUBLE", "TURNING", "TYPICAL",
    "UPDATED", "UTILITY", "VARIETY", "VEHICLE", "VENTURE", "VERSION",
    "VILLAGE", "VIOLENT", "VISIBLE", "WARNING", "WARRIOR", "WEBSITE",
    "WEDDING", "WEEKEND", "WELCOME", "WELFARE", "WILLING", "WINNING",
    "WITHOUT", "WITNESS", "WORKING", "WRITING", "YOUNGER",
    "THUNDER", "HUNDRED", "HUNTING", "HUSBAND", "LECTURE",
    "MARTIAL", "MILLION", "OBSCURE", "PREDICT", "QUANTUM",
    "REBUILD", "SCHOLAR", "WORSHIP", "ZEALOUS", "BLANKET",
    "BROWSER", "CENTURY", "CHICKEN", "COMPLEX", "COUNTER",
    "DOLPHIN", "ENDLESS", "FIFTEEN", "FREEDOM", "GORILLA",
]


def solve_math(question):
    """Solve math puzzles by parsing the expression safely."""
    match = re.search(r'What is (.+?)\?', question)
    if match:
        expr = match.group(1).strip()
        expr = expr.replace('\u00d7', '*').replace('\u00f7', '/')
        # Only allow safe chars
        if re.match(r'^[\d\s+\-*/().]+$', expr):
            try:
                tokens = _tokenize(expr)
                result = _parse_expr(tokens, 0)[0]
                if result is not None:
                    return str(int(result)) if float(result) == int(result) else str(round(result, 2))
            except:
                pass
    return "0"


def _tokenize(expr):
    tokens = []
    i = 0
    while i < len(expr):
        if expr[i].isspace():
            i += 1
        elif expr[i].isdigit() or expr[i] == '.':
            j = i
            while j < len(expr) and (expr[j].isdigit() or expr[j] == '.'):
                j += 1
            tokens.append(float(expr[i:j]))
            i = j
        elif expr[i] in '+-*/()':
            tokens.append(expr[i])
            i += 1
        else:
            i += 1
    return tokens


def _parse_expr(tokens, pos):
    """Parse addition/subtraction."""
    val, pos = _parse_term(tokens, pos)
    while pos < len(tokens) and tokens[pos] in ('+', '-'):
        op = tokens[pos]
        pos += 1
        right, pos = _parse_term(tokens, pos)
        if op == '+':
            val += right
        else:
            val -= right
    return val, pos


def _parse_term(tokens, pos):
    """Parse multiplication/division."""
    val, pos = _parse_factor(tokens, pos)
    while pos < len(tokens) and tokens[pos] in ('*', '/'):
        op = tokens[pos]
        pos += 1
        right, pos = _parse_factor(tokens, pos)
        if op == '*':
            val *= right
        else:
            val /= right
    return val, pos


def _parse_factor(tokens, pos):
    """Parse numbers and parenthesized expressions."""
    if tokens[pos] == '(':
        pos += 1  # skip (
        val, pos = _parse_expr(tokens, pos)
        if pos < len(tokens) and tokens[pos] == ')':
            pos += 1  # skip )
        return val, pos
    elif isinstance(tokens[pos], float):
        return tokens[pos], pos + 1
    else:
        return 0, pos + 1


def solve_word(question):
    match = re.search(r'Unscramble.*?:\s*(\w+)', question)
    if match:
        scrambled = match.group(1).upper()
        scrambled_sorted = sorted(scrambled)
        for word in COMMON_WORDS:
            if len(word) == len(scrambled) and sorted(word) == scrambled_sorted:
                return word
    return "UNKNOWN"


def solve_logic(question):
    nums = []
    match = re.search(r'What comes next\?\s*([\d,\s?]+)', question)
    if match:
        raw = match.group(1).strip()
        nums = [int(n.strip()) for n in raw.split(',') if n.strip().isdigit()]

    if len(nums) < 3:
        return "0"

    # Fibonacci-like
    is_fib = all(nums[i] == nums[i-1] + nums[i-2] for i in range(2, len(nums)))
    if is_fib:
        return str(nums[-1] + nums[-2])

    # Arithmetic
    diffs = [nums[i] - nums[i-1] for i in range(1, len(nums))]
    if len(set(diffs)) == 1:
        return str(nums[-1] + diffs[0])

    # Geometric
    if all(nums[i-1] != 0 for i in range(1, len(nums))):
        ratios = [nums[i] / nums[i-1] for i in range(1, len(nums))]
        if len(set(round(r, 6) for r in ratios)) == 1:
            return str(int(nums[-1] * ratios[0]))

    # Second-order differences
    diff2 = [diffs[i] - diffs[i-1] for i in range(1, len(diffs))]
    if len(diff2) >= 1 and len(set(diff2)) == 1:
        next_diff = diffs[-1] + diff2[0]
        return str(nums[-1] + next_diff)

    return str(nums[-1] + nums[-2])


def solve_trivia(puzzle):
    options = puzzle.get("options", [])
    if options:
        if isinstance(options[0], dict):
            return options[0].get('id', options[0].get('text', 'A'))
        return str(options[0])
    return "A"


def solve_puzzle(puzzle):
    game_type = puzzle.get("game_type", "")
    question = puzzle.get("question", "")

    if game_type == "math":
        return solve_math(question)
    elif game_type == "word":
        return solve_word(question)
    elif game_type == "logic":
        return solve_logic(question)
    elif game_type == "trivia":
        return solve_trivia(puzzle)
    return "42"


print("=== Playing all games with SMART solver ===\n")

total_correct = 0
total_attempts = 0

for game in GAMES:
    print(f"--- Game: {game} ---")
    for agent_id, agent_name in AGENTS:
        try:
            r = requests.get(
                f"{API}/api/games/{game}/puzzle",
                params={"difficulty": "medium"},
                headers=HEADERS,
                timeout=15
            )

            if r.status_code != 200:
                print(f"  {agent_name}: GET puzzle failed ({r.status_code}): {r.text[:100]}")
                continue

            puzzle = r.json()
            puzzle_id = puzzle.get("id")
            question_preview = puzzle.get("question", "")[:70]

            if not puzzle_id:
                print(f"  {agent_name}: No puzzle ID")
                continue

            answer = solve_puzzle(puzzle)

            submit_r = requests.post(
                f"{API}/api/games/{game}/submit",
                json={
                    "puzzleId": puzzle_id,
                    "answer": answer,
                    "timeMs": 1500 + AGENTS.index((agent_id, agent_name)) * 300,
                    "agentId": agent_id
                },
                headers=HEADERS,
                timeout=15
            )

            total_attempts += 1

            if submit_r.status_code == 200:
                result = submit_r.json()
                is_correct = result.get('is_correct', False)
                if is_correct:
                    total_correct += 1
                tag = "OK" if is_correct else "WRONG"
                correct_ans = result.get('correct_answer', '?')
                print(f"  {agent_name}: [{tag}] score={result.get('score')} | Q: {question_preview} | Submitted: {answer} | Correct: {correct_ans}")
            else:
                print(f"  {agent_name}: Submit error ({submit_r.status_code}): {submit_r.text[:120]}")

        except Exception as e:
            print(f"  {agent_name}: ERROR - {e}")

        time.sleep(0.4)
    print()

print(f"=== Results: {total_correct}/{total_attempts} correct ===")
