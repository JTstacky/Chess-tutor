// Small shared UI helpers: modal dialogs and confetti.

export interface ModalButton {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

export function showModal(title: string, bodyHtml: string, buttons: ModalButton[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2></h2><div class="modal-body"></div><div class="modal-buttons"></div></div>`;
  wrap.querySelector('h2')!.textContent = title;
  wrap.querySelector('.modal-body')!.innerHTML = bodyHtml;
  const row = wrap.querySelector('.modal-buttons')!;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = b.primary ? 'btn primary' : 'btn';
    el.textContent = b.label;
    el.addEventListener('click', () => {
      wrap.remove();
      b.onClick?.();
    });
    row.append(el);
  }
  document.body.append(wrap);
  return wrap;
}

export function confirmDialog(title: string, text: string, yes = 'Yes', no = 'Cancel'): Promise<boolean> {
  return new Promise((resolve) => {
    const safe = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    showModal(title, safe, [
      { label: no, onClick: () => resolve(false) },
      { label: yes, primary: true, onClick: () => resolve(true) },
    ]);
  });
}

export function confetti() {
  const colors = ['#ff5a5f', '#ffb400', '#00a699', '#7b61ff', '#3ec1ff', '#ff7ac6'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 120; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4500);
}
