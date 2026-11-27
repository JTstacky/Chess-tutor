import { recoveryConfig } from './net-checkpoint.js';

// Use the existing code field. Only show this action after the site opts into recovery.
export async function addRecoveryAction(recover) {
  if (!await recoveryConfig()) return;
  const style = document.createElement('link'); style.rel = 'stylesheet';
  style.href = new URL('./online-recovery.css', import.meta.url).href; document.head.append(style);
  const join = document.getElementById('btn-join'), input = document.getElementById('join-code');
  const button = document.createElement('button');
  button.id = 'btn-recover'; button.className = 'small'; button.textContent = 'Recover';
  button.title = 'Recover your room on this device using the same signed-in player profile';
  join.after(button);
  input.style.minWidth = '0'; input.style.width = '100%';
  button.addEventListener('click', () => recover(input.value));
}
