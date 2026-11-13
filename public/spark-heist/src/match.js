import {starterTeam,validateTeam,VERSION} from './catalog.js';
import {createRound,resolveSegment,command,lesson,snapshot} from './engine.js';
import {botTeam,botCommand} from './bots.js';
export function newMatch(owner,{solo=false,seed=1,now=Date.now(),pace=1}={}){
  return {version:VERSION,epoch:1,revision:1,players:[owner,solo?'bot':null],solo,seed,pace,round:1,score:[0,0],phase:solo?'planning':'waiting',deadline:solo?now+45000*pace:now+86400000,startedAt:now,expires:now+86400000,teams:[starterTeam(),starterTeam()],ready:[false,solo],commands:[null,null],next:[false,false],frames:[],state:null,roundWinner:null,matchWinner:null,tip:'Three Sparks. Six Ink. A world of possibilities.',history:[],forfeited:false};
}
function play(m,half,now){
  if(half===1){m.state=createRound(m.teams,m.seed+m.round,(m.round-1)%2);m.commands=[null,null];}
  else for(let seat=0;seat<2;seat++)if(m.commands[seat])command(m.state,seat,m.commands[seat]);
  const result=resolveSegment(m.state);m.state=result.state;m.frames=result.frames;m.phase='play'+half;m.playAt=now+(half===1?1800:500)*m.pace;m.deadline=m.playAt+8000*m.pace;m.revision++;
}
function planning(m,now){
  m.phase='planning';m.ready=[false,m.solo];m.next=[false,false];m.frames=[];m.commands=[null,null];m.deadline=now+30000*m.pace;
  if(m.solo)m.teams[1]=botTeam(m.seed,m.round,'adaptive',m.teams[0]);m.revision++;
}
export function advance(m,now=Date.now()){
  if(now>m.expires&&m.phase!=='expired'){m.phase='expired';m.frames=[];m.state=null;m.revision++;return;}
  for(let n=0;n<40&&now>=m.deadline;n++){
    const at=m.deadline;
    if(m.phase==='planning'){play(m,1,at);}
    else if(m.phase==='play1'){m.phase='command';m.deadline=at+6000*m.pace;if(m.solo)m.commands[1]=botCommand(m.state,1);m.revision++;}
    else if(m.phase==='command'){play(m,2,at);}
    else if(m.phase==='play2'){
      m.roundWinner=m.state.winner;m.score[0]+=m.roundWinner===null?.5:m.roundWinner===0?1:0;m.score[1]+=m.roundWinner===null?.5:m.roundWinner===1?1:0;
      m.tip=lesson(m.state);m.history.push({round:m.round,banked:[...m.state.banked],winner:m.roundWinner,stats:{...m.state.stats}});
      if(Math.max(...m.score)>=3||m.round>=5){m.phase='finished';m.matchWinner=m.score[0]===m.score[1]?null:m.score[0]>m.score[1]?0:1;m.deadline=m.expires;}
      else {m.phase='roundEnd';m.next=[false,m.solo];m.deadline=at+18000*m.pace;}
      m.revision++;
    } else if(m.phase==='roundEnd'){m.round++;planning(m,at);}
    else break;
  }
}
export function act(m,player,input,now=Date.now()){
  advance(m,now);
  if(!input||typeof input.type!=='string')throw Error('Invalid action.');
  if(m.phase==='expired')throw Error('This invitation has expired.');
  let seat=m.players.indexOf(player);
  if(input.type==='join'){
    if(seat>=0)return seat;
    if(m.phase!=='waiting'||m.players[1])throw Error('This duel already has two players.');
    m.players[1]=player;m.phase='planning';m.deadline=now+45000*m.pace;m.revision++;return 1;
  }
  if(seat<0)throw Error('This profile does not have a seat.');
  if(input.type==='state')return seat;
  if(input.epoch!==m.epoch||input.round!==m.round)throw Error('The round changed. Please try again.');
  if(input.type==='ready'){
    if(m.phase!=='planning')throw Error('Wait for the next planning round.');
    if(m.ready[seat])return seat;
    m.teams[seat]=validateTeam(input.team);m.ready[seat]=true;m.revision++;
    if(m.solo)m.teams[1]=botTeam(m.seed,m.round,'adaptive',[]);
    if(m.ready.every(Boolean))play(m,1,now);
  } else if(input.type==='command'){
    if(m.phase!=='command')throw Error('The command window is closed.');
    if(m.commands[seat])return seat;
    const probe=structuredClone(m.state);command(probe,seat,input.command);m.commands[seat]={slot:input.command.slot,job:input.command.job};m.revision++;
    // The deadline stays fixed: an early command never reveals the opponent's choice.
  } else if(input.type==='next'){
    if(m.phase!=='roundEnd')throw Error('Wait for the round result.');
    m.next[seat]=true;m.revision++;
    if(m.next.every(Boolean)){m.round++;planning(m,now);}
  } else if(input.type==='rematch'){
    if(m.phase!=='finished')throw Error('Finish this match first.');
    m.next[seat]=true;if(m.solo)m.next[1]=true;m.revision++;
    if(m.next.every(Boolean)){
      const fresh=newMatch(m.players[0],{solo:m.solo,seed:m.seed+7,now,pace:m.pace});fresh.players=[...m.players];fresh.phase='planning';fresh.deadline=now+45000*m.pace;fresh.epoch=m.epoch+1;fresh.revision=m.revision+1;Object.assign(m,fresh);
    }
  } else if(input.type==='leave'){
    if(!['finished','waiting'].includes(m.phase)){m.phase='finished';m.matchWinner=1-seat;m.forfeited=true;m.deadline=m.expires;m.revision++;}
  } else throw Error('Unknown action.');
  return seat;
}
export function project(m,player,now=Date.now()){
  const seat=m.players.indexOf(player);if(seat<0)throw Error('This profile does not have a seat.');
  const publicPhase=!['planning','waiting','expired'].includes(m.phase);
  return {version:m.version,epoch:m.epoch,revision:m.revision,seat,solo:m.solo,round:m.round,score:m.score,phase:m.phase,deadline:m.deadline,serverTime:now,pace:m.pace,playAt:m.playAt,ready:m.ready,opponentPresent:!!m.players[1],ownTeam:m.teams[seat],opponentTeam:publicPhase?m.teams[1-seat]:null,commandSent:!!m.commands[seat],nextSent:m.next[seat],frames:publicPhase?m.frames:[],snapshot:publicPhase&&m.state?snapshot(m.state):null,roundWinner:m.roundWinner,matchWinner:m.matchWinner,tip:m.tip,history:m.history,forfeited:m.forfeited};
}
