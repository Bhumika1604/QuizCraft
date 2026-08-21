"""
python manage.py seed_data
===========================
Seeds MongoDB with realistic sample data so a fresh install never shows
empty screens: one faculty account, one student account, several
subjects, and enough questions across Easy/Medium/Hard for each subject
to actually exercise the adaptive engine.

Safe to re-run: it skips creating anything that already exists (checked
by unique email / subject name / a stable question fingerprint), so it
won't create duplicates if you run it twice.
"""
from django.core.management.base import BaseCommand

from core.db import ensure_indexes, collections
from core.services import AuthService, SubjectService, QuestionService
from core.exceptions import ValidationError


SUBJECTS = [
    ("Python Programming", "Core Python syntax, data structures and OOP."),
    ("Web Development", "HTML, CSS, JavaScript and web fundamentals."),
    ("Database Systems", "SQL, normalization and database design."),
    ("Data Structures & Algorithms", "Arrays, trees, graphs, sorting and complexity."),
]

# (subject, question_text, [4 options], correct_answer, difficulty, marks)
QUESTIONS = [
    # ---------------- Python Programming ----------------
    ("Python Programming", "What is the correct file extension for Python files?",
     [".pt", ".py", ".pyt", ".pyth"], ".py", "Easy", 1),
    ("Python Programming", "Which keyword is used to define a function in Python?",
     ["func", "def", "function", "lambda"], "def", "Easy", 1),
    ("Python Programming", "What data type is the result of 10 / 3 in Python 3?",
     ["int", "float", "str", "complex"], "float", "Easy", 1),
    ("Python Programming", "Which built-in function returns the number of items in a list?",
     ["size()", "count()", "len()", "length()"], "len()", "Easy", 1),
    ("Python Programming", "What does the 'self' parameter represent in a class method?",
     ["The class itself", "The current instance", "A static reference", "The parent class"],
     "The current instance", "Medium", 2),
    ("Python Programming", "Which of these is used for exception handling in Python?",
     ["try/except", "catch/throw", "on error", "trap/rescue"], "try/except", "Medium", 2),
    ("Python Programming", "What is the output of list(range(2, 10, 3))?",
     ["[2, 5, 8]", "[2, 3, 4]", "[2, 5, 8, 11]", "[3, 6, 9]"], "[2, 5, 8]", "Medium", 2),
    ("Python Programming", "Which module provides thread-based parallelism in Python?",
     ["threading", "asyncio", "multiprocessing", "concurrent"], "threading", "Medium", 2),
    ("Python Programming", "What is the time complexity of dictionary lookup on average?",
     ["O(n)", "O(log n)", "O(1)", "O(n^2)"], "O(1)", "Hard", 3),
    ("Python Programming", "What does the Global Interpreter Lock (GIL) primarily restrict?",
     ["Memory allocation", "True parallel execution of Python bytecode across threads",
      "Network access", "File I/O"], "True parallel execution of Python bytecode across threads", "Hard", 3),
    ("Python Programming", "Which decorator makes a method callable on the class rather than an instance?",
     ["@staticmethod", "@property", "@classmethod", "@abstractmethod"], "@classmethod", "Hard", 3),

    # ---------------- Web Development ----------------
    ("Web Development", "What does HTML stand for?",
     ["Hyper Text Markup Language", "High Tech Modern Language",
      "Hyperlink and Text Markup Language", "Home Tool Markup Language"],
     "Hyper Text Markup Language", "Easy", 1),
    ("Web Development", "Which CSS property controls text size?",
     ["font-style", "text-size", "font-size", "text-style"], "font-size", "Easy", 1),
    ("Web Development", "Which tag is used to create a hyperlink in HTML?",
     ["<link>", "<a>", "<href>", "<url>"], "<a>", "Easy", 1),
    ("Web Development", "What does CSS stand for?",
     ["Cascading Style Sheets", "Colorful Style Sheets", "Creative Style System",
      "Computer Style Sheets"], "Cascading Style Sheets", "Easy", 1),
    ("Web Development", "Which JavaScript method converts a JSON string into an object?",
     ["JSON.parse()", "JSON.stringify()", "JSON.toObject()", "JSON.decode()"],
     "JSON.parse()", "Medium", 2),
    ("Web Development", "What is the purpose of the 'flex' display value in CSS?",
     ["To animate elements", "To create flexible box layouts", "To flip images",
      "To hide overflow"], "To create flexible box layouts", "Medium", 2),
    ("Web Development", "Which HTTP method is idempotent and used to update a resource fully?",
     ["GET", "POST", "PUT", "PATCH"], "PUT", "Medium", 2),
    ("Web Development", "What does CORS stand for?",
     ["Cross-Origin Resource Sharing", "Client Origin Request System",
      "Cross-Object Rendering Service", "Common Origin Resource Standard"],
     "Cross-Origin Resource Sharing", "Hard", 3),
    ("Web Development", "Which technique allows a webpage to update content without a full reload?",
     ["AJAX", "SSR", "DNS caching", "CSS Grid"], "AJAX", "Hard", 3),
    ("Web Development", "What does the CSS 'z-index' property control?",
     ["Element width", "Stacking order along the z-axis", "Font weight", "Grid columns"],
     "Stacking order along the z-axis", "Hard", 3),

    # ---------------- Database Systems ----------------
    ("Database Systems", "What does SQL stand for?",
     ["Structured Query Language", "Sequential Query Language", "Simple Query Logic",
      "Standard Query Language"], "Structured Query Language", "Easy", 1),
    ("Database Systems", "Which SQL clause is used to filter rows?",
     ["ORDER BY", "GROUP BY", "WHERE", "HAVING"], "WHERE", "Easy", 1),
    ("Database Systems", "Which keyword retrieves all columns from a table?",
     ["ALL", "*", "ANY", "FULL"], "*", "Easy", 1),
    ("Database Systems", "Which SQL command permanently removes a table and its structure?",
     ["DELETE", "TRUNCATE", "DROP", "REMOVE"], "DROP", "Medium", 2),
    ("Database Systems", "What is a primary key used for?",
     ["Sorting rows", "Uniquely identifying each row in a table",
      "Encrypting data", "Compressing storage"], "Uniquely identifying each row in a table",
     "Medium", 2),
    ("Database Systems", "What does normalization primarily aim to reduce?",
     ["Query speed", "Data redundancy", "Number of tables", "Index size"],
     "Data redundancy", "Medium", 2),
    ("Database Systems", "Which type of join returns only matching rows from both tables?",
     ["LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL OUTER JOIN"], "INNER JOIN", "Hard", 3),
    ("Database Systems", "In MongoDB, what is the default unique identifier field called?",
     ["id", "_id", "uuid", "pk"], "_id", "Hard", 3),
    ("Database Systems", "What does ACID stand for in database transactions?",
     ["Atomicity, Consistency, Isolation, Durability",
      "Access, Control, Integrity, Data", "Aggregation, Cache, Index, Data",
      "Atomic, Cached, Indexed, Durable"],
     "Atomicity, Consistency, Isolation, Durability", "Hard", 3),

    # ---------------- Data Structures & Algorithms ----------------
    ("Data Structures & Algorithms", "Which data structure uses FIFO (First In First Out) order?",
     ["Stack", "Queue", "Tree", "Graph"], "Queue", "Easy", 1),
    ("Data Structures & Algorithms", "Which data structure uses LIFO (Last In First Out) order?",
     ["Queue", "Stack", "Linked List", "Heap"], "Stack", "Easy", 1),
    ("Data Structures & Algorithms", "What is the time complexity of accessing an array element by index?",
     ["O(n)", "O(log n)", "O(1)", "O(n log n)"], "O(1)", "Easy", 1),
    ("Data Structures & Algorithms", "Which sorting algorithm has the best average time complexity?",
     ["Bubble Sort", "Selection Sort", "Merge Sort", "Insertion Sort"], "Merge Sort", "Medium", 2),
    ("Data Structures & Algorithms", "What is a binary search tree's average search time complexity?",
     ["O(1)", "O(log n)", "O(n)", "O(n^2)"], "O(log n)", "Medium", 2),
    ("Data Structures & Algorithms", "Which data structure is best suited for implementing recursion internally?",
     ["Queue", "Stack", "Array", "Hash Table"], "Stack", "Medium", 2),
    ("Data Structures & Algorithms", "What is the worst-case time complexity of Quick Sort?",
     ["O(n log n)", "O(n)", "O(n^2)", "O(log n)"], "O(n^2)", "Hard", 3),
    ("Data Structures & Algorithms", "Which graph traversal algorithm uses a queue?",
     ["Depth-First Search", "Breadth-First Search", "Dijkstra's only", "A* only"],
     "Breadth-First Search", "Hard", 3),
    ("Data Structures & Algorithms", "What is the space complexity of an adjacency matrix for a graph with V vertices?",
     ["O(V)", "O(V + E)", "O(V^2)", "O(log V)"], "O(V^2)", "Hard", 3),
]

SAMPLE_STUDENT = {
    "full_name": "Aditi Sharma",
    "email": "student@quizcraft.com",
    "password": "Student@123",
    "phone": "9876543210",
}

SAMPLE_FACULTY = {
    "full_name": "Dr. Rohan Mehta",
    "email": "faculty@quizcraft.com",
    "password": "Faculty@123",
    "phone": "9876500000",
}


class Command(BaseCommand):
    help = "Seed MongoDB with sample faculty/student accounts, subjects and questions."

    def handle(self, *args, **options):
        ensure_indexes()
        self.stdout.write("Connecting to MongoDB and seeding data...")

        faculty = self._get_or_create_user(SAMPLE_FACULTY, role="faculty")
        student = self._get_or_create_user(SAMPLE_STUDENT, role="student")

        for name, description in SUBJECTS:
            if not collections.subjects.find_one({"name": name}):
                SubjectService.create_subject(name, description)
                self.stdout.write(self.style.SUCCESS(f"  + Subject created: {name}"))
            else:
                self.stdout.write(f"  = Subject already exists: {name}")

        created_count = 0
        for subject, text, options, correct, difficulty, marks in QUESTIONS:
            exists = collections.questions.find_one({"subject": subject, "question_text": text})
            if exists:
                continue
            QuestionService.create(
                subject=subject, question_text=text, options=options,
                correct_answer=correct, difficulty=difficulty, marks=marks,
                created_by=str(faculty["_id"]),
            )
            created_count += 1
        self.stdout.write(self.style.SUCCESS(f"  + {created_count} question(s) added (skipped duplicates)."))

        total_q = collections.questions.count_documents({})
        total_s = collections.subjects.count_documents({})
        self.stdout.write(self.style.SUCCESS(
            f"\nSeed complete. {total_s} subjects, {total_q} questions in the bank.\n"
        ))
        self.stdout.write("Sample credentials:")
        self.stdout.write(f"  Student -> email: {SAMPLE_STUDENT['email']}  password: {SAMPLE_STUDENT['password']}")
        self.stdout.write(f"  Faculty -> email: {SAMPLE_FACULTY['email']}  password: {SAMPLE_FACULTY['password']}")

    def _get_or_create_user(self, sample, role):
        existing = collections.users.find_one({"email": sample["email"]})
        if existing:
            self.stdout.write(f"  = {role.capitalize()} account already exists: {sample['email']}")
            return existing
        try:
            user = AuthService.register(
                full_name=sample["full_name"], email=sample["email"],
                password=sample["password"], confirm_password=sample["password"],
                role=role, phone=sample.get("phone", ""),
            )
        except ValidationError:
            user = collections.users.find_one({"email": sample["email"]})
        self.stdout.write(self.style.SUCCESS(f"  + {role.capitalize()} account created: {sample['email']}"))
        return user
