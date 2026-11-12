import {plan, validatePolicy, FALLBACK} from './policy.js';
self.onmessage = event => {
  const {id, intents, bots,fields=[]} = event.data ?? {};
  if (!Number.isSafeInteger(id) || !Array.isArray(intents) || !Array.isArray(bots) || intents.length!==2 || bots.length!==2) return;
  try {
    const policies=bots.map((bot,i)=>validatePolicy(plan(intents[i],bot,bots[1-i],fields)) ?? FALLBACK);
    self.postMessage({id,policies});
  } catch {
    self.postMessage({id,policies:[FALLBACK,FALLBACK]});
  }
};
