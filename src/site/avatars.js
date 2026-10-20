// The site's own picture set for kid profiles. Nothing is uploaded: the server only stores these ids
// (AVATARS in the accounts Worker must list the same ids).
export const AVATARS = {
  cat: ['🐱', '#ffd8a8'], dog: ['🐶', '#ffe8b0'], fox: ['🦊', '#ffc9a3'], panda: ['🐼', '#e3e3e3'],
  lion: ['🦁', '#ffe08a'], tiger: ['🐯', '#ffcf8a'], frog: ['🐸', '#c8f0b0'], owl: ['🦉', '#e6d2b8'],
  penguin: ['🐧', '#cfe3ff'], unicorn: ['🦄', '#f6d2ff'], dragon: ['🐲', '#c6f2d6'], dino: ['🦖', '#d2f5c2'],
  rocket: ['🚀', '#d4dcff'], robot: ['🤖', '#dde3ea'], alien: ['👽', '#d6ffd6'], star: ['⭐', '#fff2a8'],
  rainbow: ['🌈', '#e2f4ff'], ghost: ['👻', '#ece6ff'], octopus: ['🐙', '#ffd0dc'], shark: ['🦈', '#cfe9ff'],
  turtle: ['🐢', '#d3f2c4'], bee: ['🐝', '#fff0a0'], monkey: ['🐵', '#f2dcc2'], koala: ['🐨', '#e0e4ea'],
};
export const avatarIds = Object.keys(AVATARS);

// A round picture button or badge.
export function avatarEl(id, size = 120, tag = 'span') {
  const [emoji, bg] = AVATARS[id] ?? ['🙂', '#eee'];
  const e = document.createElement(tag);
  e.className = 'avatar';
  e.style.setProperty('--size', size + 'px');
  e.style.background = bg;
  e.textContent = emoji;
  e.setAttribute('aria-hidden', 'true');
  return e;
}

// The PIN pad's keys: each digit also has a picture, so a kid can remember four pictures instead of numbers.
export const PIN_PICTURES = ['🌙', '🐱', '🚀', '⭐', '🍎', '🐶', '🌈', '🚗', '🎈', '🐟'];
