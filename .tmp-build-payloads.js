const fs=require("fs");
function prep(file, stripCommit){
  let q=fs.readFileSync(file,"utf8").replace(/^\uFEFF/,"");
  if(stripCommit) q=q.replace(/\r?\nCOMMIT;\s*$/i,"").trimEnd()+"\n";
  return q;
}
const migs=[
  ["20260624120000_min_room_players_floor_two_join_core","c:/Dr.odds/bingo/winway/.tmp-mig-fn1.sql",false],
  ["20260624120000_min_room_players_floor_two_system_join","c:/Dr.odds/bingo/winway/.tmp-mig-fn2.sql",false],
  ["20260624120000_min_room_players_floor_two_manage_waiting","c:/Dr.odds/bingo/winway/.tmp-mig-fn3.sql",true],
];
for (const [name,file,strip] of migs) {
  const query=prep(file,strip);
  const suffix = name.endsWith("join_core") ? "fn1" : name.endsWith("system_join") ? "fn2" : "fn3";
  const out = "c:/Dr.odds/bingo/winway/.tmp-apply-"+suffix+".json";
  fs.writeFileSync(out, JSON.stringify({name, query}));
  console.log(name, "query_len", query.length, "->", out);
}
