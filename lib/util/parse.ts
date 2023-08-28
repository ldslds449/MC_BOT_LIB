const debug = require('debug')('MC_BOT_LIB:parse');

export interface tabInfo{
  territory: {
    remain:number;
    total:number;
  };
  fly: {
    remain:number;
    total:number;
    add:number;
    period:number;
  };
  emerald:number;
  villager_ingot: {
    balance:number;
    price:number;
  }
  position: {
    x:number;
    y:number;
    z:number;
    world:string;
    channel:number;
  }
  time: {
    hour:number;
    minute:number;
    AMPM:string;
  }
  player: {
    channelPlayerCount:number;
    totalPlayerCount:number;
    playerLimit:number;
  }
}

export function parseTabInfo(content:string){
  const territory_regex = new RegExp('剩餘額度 : ([\\d,]+)\\/([\\d,]+) 格');
  const fly_regex = new RegExp('免費領地飛行 : ([\\d,]+)\\/([\\d,]+) 秒 \\(不使用時每([\\d,]+)秒\\+([\\d,]+)秒\\)');
  const emerald_regex = new RegExp('綠寶石餘額 : ([\\d,]+) \\/ 村民錠餘額 : ([\\d,]+) \\/ 村民錠價格 : 每個約 ([\\d,]+) 綠');
  const location_regex = new RegExp('所處位置 : 分流([\\d,]+)-(.+)-([0-1]?[0-9]|2[0-3]):([0-5][0-9]) (AM|PM)-座標 : ([\\d,-]+) ([\\d,-]+) ([\\d,-]+)');
  const channel_player_count_regex = new RegExp('當前分流人數 : ([\\d,]+)');
  const player_count_regex = new RegExp('線上人數 : ([\\d,]+) \\/ ([\\d,]+)');

  let matches:RegExpMatchArray, tab = {} as tabInfo;
  matches = content.match(territory_regex);
  tab.territory = {} as tabInfo["territory"];
  if(matches && matches.length == 3){
    tab.territory.remain = Number(matches[1].replace(/,/g, ''));
    tab.territory.total = Number(matches[2].replace(/,/g, ''));
  }else{
    debug(`PARSE ERROR: ${content}`);
  }
  matches = content.match(fly_regex);
  tab.fly = {} as tabInfo["fly"];
  if(matches && matches.length == 5){
    tab.fly.remain = Number(matches[1].replace(/,/g, ''));
    tab.fly.total = Number(matches[2].replace(/,/g, ''));
    tab.fly.period = Number(matches[3].replace(/,/g, ''));
    tab.fly.add = Number(matches[4].replace(/,/g, ''));
  }else{
    debug(`PARSE ERROR: ${content}`);
  }
  matches = content.match(emerald_regex);
  tab.villager_ingot = {} as tabInfo["villager_ingot"];
  if(matches && matches.length >= 4){
    tab.emerald = Number(matches[1].replace(/,/g, ''));
    tab.villager_ingot.balance = Number(matches[2].replace(/,/g, ''));
    tab.villager_ingot.price = Number(matches[3].replace(/,/g, ''));
  }else{
    debug(`PARSE ERROR: ${content}`);
  }
  matches = content.match(location_regex);
  tab.position = {} as tabInfo["position"];
  tab.time = {} as tabInfo["time"];
  if(matches && matches.length >= 9){
    tab.position.channel = Number(matches[1].replace(/,/g, ''));
    tab.position.world = matches[2];
    tab.position.x = Number(matches[6].replace(/,/g, ''));
    tab.position.y = Number(matches[7].replace(/,/g, ''));
    tab.position.z = Number(matches[8].replace(/,/g, ''));
    tab.time.hour = Number(matches[3]);
    tab.time.minute = Number(matches[4]);
    tab.time.AMPM = matches[5];
  }else{
    debug(`PARSE ERROR: ${content}`);
  }
  matches = content.match(channel_player_count_regex);
  tab.player = {} as tabInfo["player"];
  if(matches && matches.length >= 2){
    tab.player.channelPlayerCount = Number(matches[1].replace(/,/g, ''));
  }else{
    debug(`PARSE ERROR: ${content}`);
  }
  matches = content.match(player_count_regex);
  if(matches && matches.length >= 3){
    tab.player.totalPlayerCount = Number(matches[1].replace(/,/g, ''));
    tab.player.playerLimit = Number(matches[2].replace(/,/g, ''));
  }else{
    debug(`PARSE ERROR: ${content}`);
  }

  return tab;
}