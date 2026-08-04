# =========================================================
# QUIZCRAFT — questions.py
# -----------------------------------------------------------
# WHY: acts as the console demo's "question bank" (the in-memory
# equivalent of the questions_collection in MongoDB). AdaptiveEngine
# needs several questions per subject AND per difficulty level to
# actually have something to randomly choose between, so this list
# was extended beyond the original 3 sample questions.
# WHAT: a flat list of Question objects imported by main.py.
# WHICH MODULE USES THIS: main.py, adaptive_engine.py.
# =========================================================
from question import Question

questions = [

    # --- original sample questions (kept exactly as-is) ---
    Question(
        "Python",
        "Easy",
        "What is Python?",
        ["Language", "Snake", "Game", "Browser"],
        "Language"
    ),

    Question(
        "Python",
        "Medium",
        "Which keyword is used to create a function?",
        ["function", "define", "def", "fun"],
        "def"
    ),

    Question(
        "Python",
        "Hard",
        "Which data type stores key-value pairs?",
        ["List", "Tuple", "Dictionary", "Set"],
        "Dictionary"
    ),

    # --- additional Python questions so every difficulty has options ---
    Question(
        "Python",
        "Easy",
        "Which symbol is used to write a comment in Python?",
        ["//", "#", "<!-- -->", "/* */"],
        "#"
    ),
    Question(
        "Python",
        "Medium",
        "Which loop is guaranteed to run at least once in Python?",
        ["for loop", "while loop", "Python has no such loop", "nested loop"],
        "Python has no such loop"
    ),
    Question(
        "Python",
        "Hard",
        "What is the time complexity of a dictionary lookup on average?",
        ["O(n)", "O(log n)", "O(1)", "O(n log n)"],
        "O(1)"
    ),

    # --- Java questions ---
    Question(
        "Java",
        "Easy",
        "Which keyword is used to create a class in Java?",
        ["class", "struct", "define", "object"],
        "class"
    ),
    Question(
        "Java",
        "Medium",
        "Which collection does not allow duplicate elements?",
        ["ArrayList", "LinkedList", "HashSet", "Vector"],
        "HashSet"
    ),
    Question(
        "Java",
        "Hard",
        "What does the JVM's garbage collector reclaim?",
        ["Unused variables", "Unreachable objects", "Compiled bytecode", "Static methods"],
        "Unreachable objects"
    ),

    # --- Database (DBMS) questions ---
    Question(
        "DBMS",
        "Easy",
        "Which SQL keyword retrieves data from a table?",
        ["GET", "SELECT", "FETCH", "SHOW"],
        "SELECT"
    ),
    Question(
        "DBMS",
        "Medium",
        "Which normal form removes partial dependency?",
        ["1NF", "2NF", "3NF", "BCNF"],
        "2NF"
    ),
    Question(
        "DBMS",
        "Hard",
        "Which join returns unmatched rows from both tables?",
        ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL OUTER JOIN"],
        "FULL OUTER JOIN"
    ),
]