'use strict';

const EMOJIS = {
  alarm: '<:Alarm:1473039068546732214>',
  sandwatch: '<a:loading:1506015728871149770>',
  award: '<:Award:1473038391632203887>',
  sketch: '<:Sketch:1473038248493453352>',
  crown: '<:Crown:1506010837368963142>',
  music: '<:Music:1473039311057190972>',
  palette: '<:Palette:1473039029476917461>',
  user: '<:User:1473038971398520977>',
  fire: '<:Fire:1473038604812161218>',
  star: '<:Star:1473038501766369300>',
  check: '<:Checkedbox:1473038547165384804>',
  cancel: '<:Cancel:1473037949187657818>',
  info: '<:Infotriangle:1473038460456800459>',
  invoice: '<:Invoice:1473039492217835550>',
  shield: '<:Shield:1473038669831995494>',
  heart: '<:Heart:1473038659514007616>',
  bookopen: '<:Bookopen:1473038576391557130>',
  history: '<:History:1473037847568318605>',
  lightbulb: '<:Lightbulbalt:1473038470787240009>',
  lightning: '<:Lightningalt:1473038679906844824>',
  fileuser: '<:Fileuser:1473039570630348810>',
  present: '<:Present:1473038450465706076>',
  bots: '<:bots:1473368718120849500>',
  online: '<:online:1473369837245042762>',
  arrow_right: '1473039269726785737',
  arrow_left: '1473037847568318605',
};

function buildCooldownBar(elapsed, total, length = 20) {
  const progress = Math.min(Math.floor((elapsed / total) * length), length);
  return '█'.repeat(progress) + '░'.repeat(length - progress);
}

module.exports = { EMOJIS, buildCooldownBar };
