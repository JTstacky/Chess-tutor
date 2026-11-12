export function createLobby(solo=false){return {ready:[false,solo],busy:[false,false],solo};}
export function canFight(lobby){return lobby.ready.every(Boolean)&&!lobby.busy.some(Boolean);}
export function sealPrompt(lobby,player){if(![0,1].includes(player)||lobby.busy[player])return false;lobby.ready[player]=true;return true;}
