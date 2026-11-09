"""Usage: python3 make_quiz.py plain.json  -> writes quizzes/<date>.json (answers hashed) and updates quizzes/index.json
plain.json = {"date":"YYYY-MM-DD","questions":[{keyword,volume,q,choices[4],answer,explain,source{title,url}}]}"""
import json, sys, hashlib, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = json.load(open(sys.argv[1]))
d = src["date"]
out = {"date": d, "questions": []}
for i, q in enumerate(src["questions"]):
    q = dict(q); a = q.pop("answer")
    q["ah"] = hashlib.sha256(f"{d}|{i}|{a}|waettuen".encode()).hexdigest()[:16]
    out["questions"].append(q)
json.dump(out, open(os.path.join(root, "quizzes", d + ".json"), "w"), ensure_ascii=False, indent=1)
ip = os.path.join(root, "quizzes", "index.json")
idx = json.load(open(ip)) if os.path.exists(ip) else {"dates": []}
if d not in idx["dates"]: idx["dates"].append(d)
idx["dates"] = sorted(idx["dates"], reverse=True)[:60]
json.dump(idx, open(ip, "w"), ensure_ascii=False)
print("ok", d, len(out["questions"]))
