// agrega las variables y operadores en la caja de texto
function insertAtCursor(contentEditable, text){
  contentEditable.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0){
    contentEditable.textContent += text;
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// DOM refs
const exprDisplay = document.getElementById('exprDisplay');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const stepsEl = document.getElementById('steps');
const btnSimplify = document.getElementById('btnSimplify');
const btnExport = document.getElementById('btnExport');
const btnAddVar = document.getElementById('btnAddVar');
const btnClear = document.getElementById('btnClear');
const varDialog = document.getElementById('varDialog');
const varForm = document.getElementById('varForm');
const confirmAddVar = document.getElementById('confirmAddVar');

document.querySelectorAll('.op').forEach(btn => {
  btn.addEventListener('click', () => {
    insertAtCursor(exprDisplay, btn.dataset.insert);
    exprDisplay.focus();
  });
});

btnClear.addEventListener('click', () => {
  exprDisplay.textContent = '';
  resultEl.textContent = '';
  stepsEl.innerHTML = '';
  status('Expresion limpia.');
});

btnAddVar.addEventListener('click', () => {
  if (typeof varDialog.showModal === 'function') {
    varDialog.showModal();
    varForm.reset();
    setTimeout(()=>document.getElementById('varName').focus(),0);
  } else {
    const n = prompt('Nombre de variable (A, B1, user):');
    if (n) insertAtCursor(exprDisplay, ' ' + n + ' ');
  }
});
confirmAddVar.addEventListener('click', (e)=>{
  e.preventDefault();
  const input = document.getElementById('varName');
  if (input.reportValidity()){
    insertAtCursor(exprDisplay, ' ' + input.value + ' ');
    varDialog.close();
  }
});


// tokenization, Lee la expresion para convertirla en tokens validos
function tokenize(input){
  const tokens = [];
  let i=0;
  const isLetter = c => /[A-Za-z]/.test(c);
  const isDigit = c => /[0-9]/.test(c);
  const isIdent = c => /[A-Za-z0-9_]/.test(c);
  while(i<input.length){
    const c = input[i];
    if (c===' '||c==='\t' || c==='\n' || c==='\r'){ i++; continue; }
    if (c==='('){ tokens.push({type:'LP', v:'('}); i++; continue; }
    if (c===')'){ tokens.push({type:'RP', v:')'}); i++; continue; }
    if (c==='&' || c==='*' || c==='Â·'){ tokens.push({type:'AND', v:'&'}); i++; continue; }
    if (c==='|' || c==='+' || c.toLowerCase()==='v'){ tokens.push({type:'OR', v:'|'}); i++; continue; }
    if (c==='^'){ tokens.push({type:'XOR', v:'^'}); i++; continue; }
    if (c==='~' || c==='!'){ tokens.push({type:'NOT', v:'~'}); i++; continue; }
    if (c==='0' || c==='1'){ tokens.push({type:'CONST', v: c==='1'}); i++; continue; }
    if (isLetter(c)){
      let j=i+1;
      while(j<input.length && isIdent(input[j])) j++;
      tokens.push({type:'VAR', v: input.slice(i,j)});
      i=j; continue;
    }
    throw new Error('Caracter no valido: ' + c);
  }
  tokens.push({type:'EOF'});
  return tokens;
}

// constructor de arbol de expresiones
function ConstNode(v){ return {type:'CONST', value:!!v}; }
function VarNode(name){ return {type:'VAR', name}; }
function NotNode(child){ return {type:'NOT', child}; }
function AndNode(children){ return {type:'AND', children}; }
function OrNode(children){ return {type:'OR', children}; }
function XorNode(left,right){ return {type:'XOR', left, right}; }

// lee recursivamente los tokens y normaliza la expresion
function parse(input){
  const tokens = Array.isArray(input) ? input : tokenize(input);
  let pos = 0;
  const peek = ()=> tokens[pos];
  const eat = (typ) => { const t = tokens[pos]; if (t.type !== typ) throw new Error('Token inesperado: ' + t.type + ' se esperaba ' + typ); pos++; return t; };

  function parseExpr(){ return parseOr(); }
  function parseOr(){
    let node = parseXor();
    while(peek().type === 'OR'){ eat('OR'); const right = parseXor(); node = OrNode(flattenOr(node, right)); }
    return node;
  }
  function parseXor(){
    let node = parseAnd();
    while(peek().type === 'XOR'){ eat('XOR'); const right = parseAnd(); node = XorNode(node, right); }
    return node;
  }
  function parseAnd(){
    let node = parseUnary();
    while(peek().type === 'AND'){ eat('AND'); const right = parseUnary(); node = AndNode(flattenAnd(node, right)); }
    return node;
  }
  function parseUnary(){
    if (peek().type === 'NOT'){ eat('NOT'); return NotNode(parseUnary()); }
    return parsePrimary();
  }
  function parsePrimary(){
    const t = peek();
    if (t.type === 'VAR'){ eat('VAR'); return VarNode(t.v); }
    if (t.type === 'CONST'){ eat('CONST'); return ConstNode(t.v); }
    if (t.type === 'LP'){ eat('LP'); const e = parseExpr(); eat('RP'); return e; }
    throw new Error('Token inesperado: ' + t.type);
  }

  const ast = parseExpr();
  if (peek().type !== 'EOF') throw new Error('Entrada no consumida completa');
  return ast;
}

// reconstruye la expresion en una cadena 
function toString(node){
  const prec = { OR:1, XOR:2, AND:3, NOT:4, VAR:5, CONST:5 };
  function wrap(child, parentType){
    const need = precedence(child) < precedence(parentType);
    return need ? '(' + toString(child) + ')' : toString(child);
  }
  function precedence(n){
    if (!n) return 0;
    switch(n.type){
      case 'OR': return 1;
      case 'XOR': return 2;
      case 'AND': return 3;
      case 'NOT': return 4;
      case 'VAR': case 'CONST': return 5;
    }
  }
  switch(node.type){
    case 'VAR': return node.name;
    case 'CONST': return node.value ? '1' : '0';
    case 'NOT':
      if (node.child.type==='VAR' || node.child.type==='CONST' || node.child.type==='NOT') return '~' + toString(node.child);
      return '~(' + toString(node.child) + ')';
    case 'AND': return node.children.map(c=> precedence(c) < precedence({type:'AND'}) ? '('+toString(c)+')' : toString(c)).join(' & ');
    case 'OR': return node.children.map(c=> precedence(c) < precedence({type:'OR'}) ? '('+toString(c)+')' : toString(c)).join(' | ');
    case 'XOR': return (precedence(node.left)<precedence({type:'XOR'})? '('+toString(node.left)+')':toString(node.left)) + ' ^ ' + (precedence(node.right)<precedence({type:'XOR'})? '('+toString(node.right)+')':toString(node.right));
  }
}

// helper flatteners for AND/OR
function flattenAnd(a,b){
  const out = [];
  if (a.type === 'AND') out.push(...a.children); else out.push(a);
  if (b.type === 'AND') out.push(...b.children); else out.push(b);
  return out;
}
function flattenOr(a,b){
  const out = [];
  if (a.type === 'OR') out.push(...a.children); else out.push(a);
  if (b.type === 'OR') out.push(...b.children); else out.push(b);
  return out;
}

// deep clone
function clone(node){
  switch(node.type){
    case 'CONST': return ConstNode(node.value);
    case 'VAR': return VarNode(node.name);
    case 'NOT': return NotNode(clone(node.child));
    case 'AND': return AndNode(node.children.map(clone));
    case 'OR': return OrNode(node.children.map(clone));
    case 'XOR': return XorNode(clone(node.left), clone(node.right));
  }
}

// canonical string for commutative comparison
function canonicalStr(n){
  switch(n.type){
    case 'AND':
      return 'AND(' + n.children.map(canonicalStr).sort().join(',') + ')';
    case 'OR':
      return 'OR(' + n.children.map(canonicalStr).sort().join(',') + ')';
    case 'NOT': return 'NOT(' + canonicalStr(n.child) + ')';
    case 'XOR': return 'XOR(' + canonicalStr(n.left) + ',' + canonicalStr(n.right) + ')';
    case 'VAR': return 'VAR(' + n.name + ')';
    case 'CONST': return 'CONST(' + (n.value?1:0) + ')';
  }
}

// es la que realiza la simplificacion aplicando las leyes booleanas y guardando los pasos en una 
// lista para luego mostrarlos
function simplify(ast){
  const steps = [];
  function pushStep(before, after, rule){
    const sBefore = toString(before);
    const sAfter = toString(after);
    if (sBefore !== sAfter){
      steps.push({rule, before: sBefore, after: sAfter});
    }
    return after;
  }

  
  function uniqueByCanonical(arr){
    const seen = new Set();
    const out = [];
    for(const x of arr){
      const k = canonicalStr(x);
      if (!seen.has(k)){ seen.add(k); out.push(x); }
    }
    return out;
  }
  function containsNegation(list, node){
    const s = toString(node);
    for(const x of list){
      if (x.type === 'NOT' && toString(x.child) === s) return true;
      if (node.type === 'NOT' && toString(node.child) === toString(x)) return true;
    }
    return false;
  }

  // normalize helper: flatten and remove identities
  function normalize(n){
    switch(n.type){
      case 'CONST': return n;
      case 'VAR': return n;
      case 'NOT': return NotNode(normalize(n.child));
      case 'AND': {
        let ch = n.children.map(normalize).flatMap(c => c.type==='AND'?c.children:[c]);
        ch = ch.filter(c => !(c.type==='CONST' && c.value === true));
        if (ch.length === 0) return ConstNode(true);
        if (ch.some(c => c.type==='CONST' && c.value === false)) return ConstNode(false);
        ch = uniqueByCanonical(ch).sort((a,b)=> toString(a).localeCompare(toString(b)));
        return AndNode(ch);
      }
      case 'OR': {
        let ch = n.children.map(normalize).flatMap(c => c.type==='OR'?c.children:[c]);
        ch = ch.filter(c => !(c.type==='CONST' && c.value === false));
        if (ch.length === 0) return ConstNode(false);
        if (ch.some(c => c.type==='CONST' && c.value === true)) return ConstNode(true);
        ch = uniqueByCanonical(ch).sort((a,b)=> toString(a).localeCompare(toString(b)));
        return OrNode(ch);
      }
      case 'XOR':
        return XorNode(normalize(n.left), normalize(n.right));
    }
  }

  // apply single-step transformations recursively
  function step(node){
    switch(node.type){
      case 'CONST': return node;
      case 'VAR': return node;
      case 'NOT': {
        const c = step(node.child);
        // doble negacion: ~~X = X
        if (c.type === 'NOT'){ return pushStep(node, c.child, 'Doble negacion'); }
        // De Morgan: ~(A & B) = ~A | ~B
        if (c.type === 'AND'){
          const mapped = c.children.map(x => NotNode(x));
          const res = OrNode(mapped);
          return pushStep(node, res, 'De Morgan');
        }
        // De Morgan: ~(A | B) = ~A & ~B
        if (c.type === 'OR'){
          const mapped = c.children.map(x => NotNode(x));
          const res = AndNode(mapped);
          return pushStep(node, res, 'De Morgan');
        }
        // complement constants
        if (c.type === 'CONST'){
          const res = ConstNode(!c.value);
          return pushStep(node, res, 'Complemento constante');
        }
        return NotNode(c);
      }
      case 'AND': {
        const children = node.children.map(step);
        const before = AndNode(children);
        // identity: X & 1 = X (remove 1)
        if (children.some(c => c.type==='CONST' && c.value===true)){
          const filtered = children.filter(c => !(c.type==='CONST' && c.value===true));
          const res = filtered.length===0 ? ConstNode(true) : (filtered.length===1 ? filtered[0] : AndNode(filtered));
          return pushStep(before, res, 'Identidad AND');
        }
        // annul: X & 0 = 0
        if (children.some(c => c.type==='CONST' && c.value===false)){
          return pushStep(before, ConstNode(false), 'Anulacion AND');
        }
        // idempotencia: remove duplicates
        let uniq = uniqueByCanonical(children);
        if (uniq.length !== children.length) return pushStep(before, AndNode(uniq), 'Idempotencia AND');
        // complemento: X & ~X = 0
        for(const c of uniq){
          if (containsNegation(uniq, c)) return pushStep(before, ConstNode(false), 'Complemento AND');
        }
        // absorcion: X & (X | Y) = X
        for(let i=0;i<uniq.length;i++){
          for(let j=0;j<uniq.length;j++){
            if (i===j) continue;
            const a = uniq[i], b = uniq[j];
            if (b.type==='OR' && b.children.some(ch => toString(ch)===toString(a))){
              return pushStep(before, a, 'Absorcion AND');
            }
          }
        }
        // distributiva simple: try factor common from pairs (A|B)&(A|C) => A | (B & C)
        const orIdx = uniq.map((c,idx)=>[c,idx]).filter(([c])=>c.type==='OR');
        if (orIdx.length >= 2){
          for(let p=0;p<orIdx.length;p++){
            for(let q=p+1;q<orIdx.length;q++){
              const [o1,i1] = orIdx[p], [o2,i2] = orIdx[q];
              for(const lit1 of o1.children){
                if (o2.children.some(lit2 => toString(lit2)===toString(lit1))){
                  // build factored: lit1 | (rest1 & rest2 & otherAnds)
                  const rest1 = o1.children.filter(x=> toString(x)!==toString(lit1));
                  const rest2 = o2.children.filter(x=> toString(x)!==toString(lit1));
                  const other = uniq.filter((_,k)=>k!==i1 && k!==i2);
                  const andPartChildren = [...rest1, ...rest2, ...other].filter(x=> x);
                  const andPart = andPartChildren.length===0? ConstNode(true) : (andPartChildren.length===1? andPartChildren[0] : AndNode(andPartChildren));
                  const res = OrNode([lit1, andPart]);
                  return pushStep(before, res, 'Distributiva (factor comun) AND');
                }
              }
            }
          }
        }
        return before;
      }
      case 'OR': {
        const children = node.children.map(step);
        const before = OrNode(children);
        // identity: X | 0 = X
        if (children.some(c => c.type==='CONST' && c.value===false)){
          const filtered = children.filter(c => !(c.type==='CONST' && c.value===false));
          const res = filtered.length===0 ? ConstNode(false) : (filtered.length===1 ? filtered[0] : OrNode(filtered));
          return pushStep(before, res, 'Identidad OR');
        }
        // annul: X | 1 = 1
        if (children.some(c => c.type==='CONST' && c.value===true)){
          return pushStep(before, ConstNode(true), 'Anulacion OR');
        }
        // idempotencia: remove duplicates
        let uniq = uniqueByCanonical(children);
        if (uniq.length !== children.length) return pushStep(before, OrNode(uniq), 'Idempotencia OR');
        // complemento: X | ~X = 1
        for(const c of uniq){
          if (containsNegation(uniq, c)) return pushStep(before, ConstNode(true), 'Complemento OR');
        }
        // absorcion: X | (X & Y) = X
        for(let i=0;i<uniq.length;i++){
          for(let j=0;j<uniq.length;j++){
            if (i===j) continue;
            const a = uniq[i], b = uniq[j];
            if (b.type==='AND' && b.children.some(ch => toString(ch)===toString(a))){
              return pushStep(before, a, 'Absorcion OR');
            }
          }
        }
        // distributiva simple: (A & B) | (A & C) = A & (B | C)
        const andIdx = uniq.map((c,idx)=>[c,idx]).filter(([c])=>c.type==='AND');
        if (andIdx.length >= 2){
          for(let p=0;p<andIdx.length;p++){
            for(let q=p+1;q<andIdx.length;q++){
              const [a1,i1] = andIdx[p], [a2,i2] = andIdx[q];
              for(const lit1 of a1.children){
                if (a2.children.some(lit2 => toString(lit2)===toString(lit1))){
                  const rest1 = a1.children.filter(x => toString(x)!==toString(lit1));
                  const rest2 = a2.children.filter(x => toString(x)!==toString(lit1));
                  const other = uniq.filter((_,k)=>k!==i1 && k!==i2);
                  const orPartChildren = [...rest1, ...rest2, ...other].filter(x=> x);
                  const orPart = orPartChildren.length===0? ConstNode(false) : (orPartChildren.length===1? orPartChildren[0] : OrNode(orPartChildren));
                  const res = AndNode([lit1, orPart]);
                  return pushStep(before, res, 'Distributiva (factor comun) OR');
                }
              }
            }
          }
        }
        return before;
      }
      case 'XOR': {
        const l = step(node.left), r = step(node.right);
        const before = XorNode(l,r);
        // X ^ 0 = X
        if (r.type==='CONST' && r.value===false) return pushStep(before, l, 'XOR identidad (X^0=X)');
        if (l.type==='CONST' && l.value===false) return pushStep(before, r, 'XOR identidad (0^X=X)');
        // X ^ 1 = ~X
        if (r.type==='CONST' && r.value===true) return pushStep(before, NotNode(l), 'XOR con 1 (X^1=~X)');
        if (l.type==='CONST' && l.value===true) return pushStep(before, NotNode(r), 'XOR con 1 (1^X=~X)');
        // X ^ X = 0
        if (toString(l) === toString(r)) return pushStep(before, ConstNode(false), 'XOR cancelacion (X^X=0)');
        return before;
      }
    }
  }

  // iterate until no change
  let current = normalize(ast);
  while(true){
    const beforeS = toString(current);
    const afterNode = normalize(step(current));
    const afterS = toString(afterNode);
    if (afterS === beforeS) break;
    current = afterNode;
  }
  // steps array already filled by pushStep calls
  return {node: current, steps};
}


let lastResult = null;
btnSimplify.addEventListener('click', () => {
  const raw = exprDisplay.textContent.trim();
  if (!raw){
    status('No hay expresion para simplificar.');
    alert('La expresion esta vacia.');
    return;
  }
  try{
    const normalized = raw.replace(/Â·/g,'&').replace(/\s+/g,' ').trim();
    const ast = parse(normalized);
    const out = simplify(ast);
    const text = toString(out.node);
    resultEl.textContent = text;
    renderSteps(out.steps);
    status('Simplificacion completa. ' + out.steps.length + ' paso(s).');
    lastResult = { original: raw, normalized, simplified: text, steps: out.steps };
  }catch(err){
    console.error(err);
    resultEl.textContent = '';
    stepsEl.innerHTML = '';
    status('Error de sintaxis. Revisa la expresion.');
    alert('Error: ' + err.message);
  }
});
// esta funcion se encarga de mostrar los pasos que se aplicaron para simplificar la expresion  
function renderSteps(steps){
  stepsEl.innerHTML = '';
  if (!steps.length){
    const li = document.createElement('li');
    li.textContent = 'No se aplico ninguna ley (ya esta simplificada o no hubo transformacion).';
    stepsEl.appendChild(li);
    return;
  }
  for(const s of steps){
    const li = document.createElement('li');
    li.textContent = s.rule + ' : ' + s.before + ' => ' + s.after;
    stepsEl.appendChild(li);
  }
}

// export JSON
btnExport.addEventListener('click', ()=>{
  const payload = lastResult || { original: exprDisplay.textContent.trim()||null, normalized:null, simplified:null, steps:[] };
  const blob = new Blob([JSON.stringify(payload,null,2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'simplificacion_con_pasos.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 0);
});

// initial demo content
exprDisplay.textContent = '(A & B) | (A & ~B)';
status('Listo');

function status(msg){ statusEl.textContent = msg; }