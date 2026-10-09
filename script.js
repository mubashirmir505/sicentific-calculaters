/* ===== Scientific Calculator ===== */
const $ = (id) => document.getElementById(id);
const FUNCS = ["sin⁻¹", "cos⁻¹", "tan⁻¹", "sin", "cos", "tan", "ln", "log", "√"];

let expr = "";            // what the user typed
let prev = "";            // small line above the result
let ans = 0;              // last answer
let deg = true;           // Deg / Rad mode
let inv = false;          // Inv toggle
let justEvaluated = false;
let error = false;
let history = [];

try { history = JSON.parse(localStorage.getItem("calcHistory")) || []; } catch (e) {}

/* ---------- Helpers ---------- */
function fmt(n) {
  return String(parseFloat(n.toPrecision(12))).replace("e", "E").replace(/-/g, "−");
}

function closeParens(s) {
  const open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
  return s + ")".repeat(Math.max(open, 0));
}

function factorial(n) {
  if (n < 0 || !Number.isInteger(n) || n > 170) throw new Error("Invalid factorial");
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);

function applyFn(name, x) {
  const toRad = (v) => (deg ? (v * Math.PI) / 180 : v);
  const fromRad = (v) => (deg ? (v * 180) / Math.PI : v);
  switch (name) {
    case "sin": return clean(Math.sin(toRad(x)));
    case "cos": return clean(Math.cos(toRad(x)));
    case "tan":
      if (deg && Math.abs(x % 180) === 90) throw new Error("Undefined");
      return clean(Math.tan(toRad(x)));
    case "sin⁻¹": return fromRad(Math.asin(x));
    case "cos⁻¹": return fromRad(Math.acos(x));
    case "tan⁻¹": return fromRad(Math.atan(x));
    case "ln": return Math.log(x);
    case "log": return Math.log10(x);
    case "√": return Math.sqrt(x);
  }
}

/* ---------- Tokenizer ---------- */
function tokenize(str) {
  const s = str.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const m = rest.match(/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/);
    if (m) { out.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
    const f = FUNCS.find((n) => rest.startsWith(n));
    if (f) { out.push({ t: "fn", v: f }); i += f.length; continue; }
    const c = rest[0];
    if (c === "π") out.push({ t: "num", v: Math.PI });
    else if (c === "e") out.push({ t: "num", v: Math.E });
    else if ("+-*/^!%()".includes(c)) out.push({ t: "op", v: c });
    else throw new Error("Syntax error");
    i++;
  }
  return out;
}

/* ---------- Parser (recursive descent) ---------- */
function evaluate(str) {
  const tk = tokenize(str);
  let p = 0;
  const isOp = (v) => tk[p] && tk[p].t === "op" && tk[p].v === v;
  const startsOperand = () => tk[p] && (tk[p].t === "num" || tk[p].t === "fn" || isOp("("));

  function expression() {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const o = tk[p++].v;
      const r = term();
      v = o === "+" ? v + r : v - r;
    }
    return v;
  }

  function term() {
    let v = unary();
    while (true) {
      if (isOp("*") || isOp("/")) {
        const o = tk[p++].v;
        const r = unary();
        v = o === "*" ? v * r : v / r;
      } else if (startsOperand()) {
        v *= unary();            // implicit multiplication: 2π, 3(4)
      } else break;
    }
    return v;
  }

  function unary() {
    if (isOp("-")) { p++; return -unary(); }
    if (isOp("+")) { p++; return unary(); }
    return power();
  }

  function power() {
    const base = postfix();
    if (isOp("^")) { p++; return Math.pow(base, unary()); }
    return base;
  }

  function postfix() {
    let v = primary();
    while (isOp("!") || isOp("%")) {
      v = tk[p++].v === "!" ? factorial(v) : v / 100;
    }
    return v;
  }

  function primary() {
    const t = tk[p];
    if (!t) throw new Error("Incomplete");
    if (t.t === "num") { p++; return t.v; }
    if (t.t === "fn") {
      p++;
      let a;
      if (isOp("(")) { p++; a = expression(); if (isOp(")")) p++; }
      else a = power();
      return applyFn(t.v, a);
    }
    if (isOp("(")) { p++; const v = expression(); if (isOp(")")) p++; return v; }
    throw new Error("Syntax error");
  }

  const result = expression();
  if (p < tk.length) throw new Error("Syntax error");
  return result;
}

/* ---------- Display ---------- */
function render() {
  $("result").textContent = error ? "Error" : expr || "0";
  $("result").scrollLeft = $("result").scrollWidth;

  let small = prev;
  if (!justEvaluated && !error && expr) {
    try {
      const v = evaluate(closeParens(expr));
      if (isFinite(v) && fmt(v) !== expr) small = "= " + fmt(v);
    } catch (e) {}
  }
  $("expression").textContent = small;
  $("acBtn").textContent = expr && !justEvaluated ? "CE" : "AC";
}

/* ---------- Actions ---------- */
function insert(t) {
  if (error) { expr = ""; error = false; }
  if (justEvaluated) {
    if (!/^[+−×÷^!%]/.test(t)) expr = "";
    justEvaluated = false;
    prev = "";
  }
  const last = expr.slice(-1);
  if (/^[+×÷^!%]$/.test(t) && !expr) return;
  if (/^[+−×÷]$/.test(t) && /[+−×÷]/.test(last)) {
    if (t === "−" && /[×÷]/.test(last)) { /* allow 5×−3 */ }
    else expr = expr.slice(0, -1);
  }
  if (t === "E" && !/\d$/.test(expr)) return;
  expr += t;
  render();
}

function equals() {
  if (!expr || justEvaluated) return;
  const e = closeParens(expr);
  try {
    const v = evaluate(e);
    if (!isFinite(v)) throw new Error("Math error");
    ans = v;
    addHistory(e, v);
    prev = e + " =";
    expr = fmt(v);
    justEvaluated = true;
  } catch (err) {
    error = true;
    prev = e + " =";
    justEvaluated = false;
  }
  render();
}

function backspace() {
  const m = expr.match(/(sin⁻¹\(|cos⁻¹\(|tan⁻¹\(|sin\(|cos\(|tan\(|ln\(|log\(|√\()$/);
  expr = m ? expr.slice(0, -m[0].length) : expr.slice(0, -1);
  render();
}

function clearAll() {
  expr = ""; prev = ""; error = false; justEvaluated = false;
  render();
}

function setInv() {
  document.querySelectorAll("[data-inv-insert]").forEach((b) => {
    b.innerHTML = inv ? b.dataset.invLabel : b.dataset.label;
  });
  $("invBtn").classList.toggle("active", inv);
}

function setMode(isDeg) {
  deg = isDeg;
  $("degBtn").classList.toggle("active", deg);
  $("radBtn").classList.toggle("active", !deg);
  render();
}

/* ---------- History ---------- */
function addHistory(e, v) {
  history.unshift({ e, r: fmt(v) });
  history = history.slice(0, 30);
  try { localStorage.setItem("calcHistory", JSON.stringify(history)); } catch (err) {}
  renderHistory();
}

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  if (!history.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No calculations yet";
    list.appendChild(li);
    return;
  }
  history.forEach((h) => {
    const li = document.createElement("li");
    const a = document.createElement("span");
    const b = document.createElement("span");
    a.className = "h-expr"; a.textContent = h.e + " =";
    b.className = "h-res";  b.textContent = h.r;
    li.append(a, b);
    li.addEventListener("click", () => {
      expr = h.r; prev = ""; justEvaluated = false; error = false;
      $("historyPanel").classList.add("hidden");
      render();
    });
    list.appendChild(li);
  });
}

/* ---------- Events ---------- */
document.querySelectorAll("[data-inv-insert]").forEach((b) => (b.dataset.label = b.innerHTML));

document.querySelector(".calculator").addEventListener("click", (e) => {
  const b = e.target.closest(".keys button");
  if (!b) return;
  if (b.dataset.insert) {
    const useInv = inv && b.dataset.invInsert;
    insert(useInv ? b.dataset.invInsert : b.dataset.insert);
    if (useInv) { inv = false; setInv(); }
    return;
  }
  switch (b.dataset.action) {
    case "equals": equals(); break;
    case "clear":  (expr && !justEvaluated) ? backspace() : clearAll(); break;
    case "ans":    insert(fmt(ans)); break;
    case "inv":    inv = !inv; setInv(); break;
    case "deg":    setMode(true); break;
    case "rad":    setMode(false); break;
  }
});

$("historyBtn").addEventListener("click", () => $("historyPanel").classList.toggle("hidden"));
$("clearHistory").addEventListener("click", () => {
  history = [];
  try { localStorage.removeItem("calcHistory"); } catch (err) {}
  renderHistory();
});

document.addEventListener("keydown", (e) => {
  const k = e.key;
  if (/^[0-9.()!%^]$/.test(k)) insert(k);
  else if (k === "+") insert("+");
  else if (k === "-") insert("−");
  else if (k === "*") insert("×");
  else if (k === "/") { e.preventDefault(); insert("÷"); }
  else if (k === "Enter" || k === "=") { e.preventDefault(); equals(); }
  else if (k === "Backspace") backspace();
  else if (k === "Escape") clearAll();
  else if (k === "p") insert("π");
});

renderHistory();
render();