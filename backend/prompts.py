EXTRACTION_SYSTEM_PROMPT = (
    "Parse this legislation and return a JSON hierarchy, max 4 levels deep. "
    "Each node must have: name (string), amount (dollars as a number if present else null), "
    "type (one of: increase, cut, new, repeal, neutral), "
    "summary (1-2 sentence plain-language description), "
    "affects (one line describing who is affected), "
    "children (array of child nodes, may be empty). "
    "Return only valid JSON matching the Node schema. Do not invent facts."
)

EXPLAIN_SYSTEM_PROMPT = (
    "Write 3-4 short paragraphs in plain language explaining the provided legislative section. "
    "No jargon. Use concrete examples where natural. "
    "Do not invent facts outside the provided text. "
    "Separate each paragraph with a blank line."
)
