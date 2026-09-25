// Make an input behave the way a React-controlled one does: the instance gets its own
// `value` setter that swallows direct assignment, and the component's "state" only moves
// when a bubbling `input` event fires. This is the exact failure mode the native-setter
// path in dom.js exists for — a fixture that accepts `el.value = x` would prove nothing.
window.__state = {};
window.__controlled = (el) => {
  // A radio is controlled on `checked`, not on `value` — overriding `value` here would test
  // nothing, since the extension never writes a radio's value. Recording the option's value
  // on `change` is what a controlled radio group actually stores in state.
  const prop = el.type === 'radio' || el.type === 'checkbox' ? 'checked' : 'value';
  const desc = Object.getOwnPropertyDescriptor(el.constructor.prototype, prop);
  Object.defineProperty(el, prop, {
    configurable: true,
    get() { return desc.get.call(el); },
    set() { /* React ignores writes it did not make */ },
  });
  const key = el.name || el.id;
  if (prop === 'checked') {
    el.addEventListener('change', () => { if (desc.get.call(el)) window.__state[key] = el.value; });
  } else {
    el.addEventListener('input', () => { window.__state[key] = desc.get.call(el); });
  }
};
window.__controlAll = (root = document) => root.querySelectorAll('[data-controlled]').forEach(window.__controlled);
