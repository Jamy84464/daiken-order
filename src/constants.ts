import type { BankInfo, Category } from "./types";

export const VERSION = "v3.0.1";
export const BASE_URL = "https://www.daikenshop.com/allgoods.php";
export const DEFAULT_BULLETIN = "每月月底結單，填寫完成後送出，我會與您聯繫確認付款方式 🙏";
export const DEFAULT_BANK: BankInfo = { bankName: "玉山銀行", bankCode: "808", account: "0989979013999", accountName: "林志銘" };
export const GAS_URL = process.env.REACT_APP_GAS_URL;
export const WRITE_TOKEN = process.env.REACT_APP_WRITE_TOKEN;
if (!GAS_URL || !WRITE_TOKEN) console.warn("Missing REACT_APP_GAS_URL or REACT_APP_WRITE_TOKEN. Copy .env.example to .env.local and fill in values.");

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
export const C = {
  green: "#2d6a4f", gl: "#40916c", gp: "#d8f3dc", gold: "#b7791f",
  cream: "#faf7f2", text: "#1a1a1a", muted: "#6b7280", border: "#e5e0d8",
  red: "#c0392b", white: "#fff",
};

export const globalCSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Noto Sans TC',sans-serif;background:${C.cream};color:${C.text}}
  input,select,textarea,button{font-family:'Noto Sans TC',sans-serif}
  .serif{font-family:'Noto Serif TC',serif}
  input[type=number]{-moz-appearance:textfield}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:${C.gp};border-radius:2px}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pop{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
  .fu{animation:fadeUp .3s ease}
  .pop{animation:pop .25s cubic-bezier(.34,1.56,.64,1)}
  a{color:${C.gl};text-decoration:none}
  a:hover{text-decoration:underline}
  @media screen and (max-width:768px){
    input,select,textarea{font-size:16px!important}
  }
`;

const D = "https://www.daikenshop.com/product.php?code=";
export const INIT_CATS: Category[] = [
  { key:"fish", label:"🐟 魚油系列", products:[
    {id:"p1", name:"德國頂級魚油",                    price:700,  outOfStock:false, url:D+"4710255450036"},
    {id:"p2", name:"德國頂級魚油(旗艦加大120粒)",      price:1450, outOfStock:false, url:D+"4710255450487"},
    {id:"p3", name:"兒童DHA 80% 魚油軟膠囊",     price:450,  outOfStock:false, url:D+"4710255450364"},
    {id:"p4", name:"EPA 1200 頂級魚油軟膠囊",          price:820,  outOfStock:false, url:D+"4710255450920"},
    {id:"p5", name:"德國頂級魚油軟膠囊EX",        price:1008, outOfStock:false, url:D+"4710255450845"},
  ]},
  { key:"vitamin", label:"💊 維生素礦物質", products:[
    {id:"p6",  name:"倍力他命BELINAMIN膜衣錠",         price:475,  outOfStock:false, url:D+"4710255450722"},
    {id:"p7",  name:"德國高劑量維生素C＋鋅發泡錠",     price:130,  outOfStock:false, url:D+"4710255450814"},
    {id:"p8",  name:"維他命C緩釋膜衣錠",               price:240,  outOfStock:false, url:D+"4710255450067"},
    {id:"p9",  name:"西印度櫻桃維生素C膠囊",           price:240,  outOfStock:false, url:D+"4710255451088"},
    {id:"p10", name:"綜合維他命緩釋膜衣錠",            price:240,  outOfStock:false, url:D+"4710255450074"},
    {id:"p11", name:"綜合鈣+D3 粉包",                  price:390,  outOfStock:false, url:D+"4710255450173"},
    {id:"p12", name:"海藻鈣海洋精華膠囊",              price:390,  outOfStock:false, url:D+"4710255451095"},
    {id:"p13", name:"男性B群+鋅雙層錠",                price:240,  outOfStock:false, url:D+"4710255450043"},
    {id:"p14", name:"女性B群緩釋雙層錠",               price:240,  outOfStock:false, url:D+"4710255450050"},
    {id:"p15", name:"B群緩釋雙層錠",                   price:240,  outOfStock:false, url:D+"4710255450333"},
    {id:"p16", name:"維生素D3膠囊",                    price:300,  outOfStock:false, url:D+"4710255450456"},
  ]},
  { key:"cardio", label:"❤️ 心血管代謝", products:[
    {id:"p17", name:"納豆紅麴Q10膠囊",                 price:800,  outOfStock:false, url:D+"4710255450265"},
    {id:"p18", name:"台灣極品納豆膠囊",                price:450,  outOfStock:false, url:D+"4710255450951"},
    {id:"p19", name:"德國專利苦瓜胜肽膠囊",            price:820,  outOfStock:false, url:D+"4710255450647"},
    {id:"p20", name:"德國專利苦瓜胜肽膠囊EX",          price:1188, outOfStock:false, url:D+"4710255450869"},
    {id:"p21", name:"超燃藤黃果乳酸菌錠",              price:800,  outOfStock:false, url:D+"4710255451231"},
    {id:"p22", name:"超級1000薑黃錠",                  price:800,  outOfStock:false, url:D+"4710255451125"},
    {id:"p23", name:"薑黃朝鮮薊膠囊",                  price:800,  outOfStock:false, url:D+"4710255451064"},
  ]},
  { key:"eye", label:"👁 眼睛腦力", products:[
    {id:"p24", name:"視易適葉黃素",                    price:700,  outOfStock:false, url:D+"0000000000028"},
    {id:"p25", name:"視易適葉黃素軟膠囊EX",            price:900,  outOfStock:false, url:D+"4710255450852"},
    {id:"p26", name:"好記易PS銀杏薄荷葉膠囊",          price:1190, outOfStock:false, url:D+"4710255450777"},
  ]},
  { key:"gut", label:"🦠 腸道消化", products:[
    {id:"p27", name:"高膳食纖維粉包",                  price:250,  outOfStock:false, url:D+"4710255450616"},
    {id:"p28", name:"冒易舒接骨木莓粉包",              price:310,  outOfStock:false, url:D+"4710255450272"},
    {id:"p29", name:"順暢酵素益生菌粉包(30包入)",      price:730,  outOfStock:false, url:D+"4710255450524"},
    {id:"p30", name:"淨密樂甘露糖蔓越莓益生菌",        price:390,  outOfStock:false, url:D+"4710255450319"},
    {id:"p31", name:"健好衛高麗菜精乳酸菌粉包",        price:730,  outOfStock:false, url:D+"4710255450371"},
    {id:"p32", name:"化晶解風鰹魚酸櫻桃膠囊",          price:800,  outOfStock:false, url:D+"4710255451170"},
  ]},
  { key:"vitality", label:"⚡ 活力滋補", products:[
    {id:"p33", name:"精氣神瑪卡粉包",                  price:649,  outOfStock:false, url:D+"4710255450302"},
    {id:"p34", name:"精氣神瑪卡粉包(超值加大30包)",    price:790,  outOfStock:false, url:D+"4710255450500"},
    {id:"p35", name:"精氣神瑪卡粉包EX",                price:900,  outOfStock:false, url:D+"4710255450883"},
    {id:"p36", name:"100%黑瑪卡透納葉錠",              price:700,  outOfStock:false, url:D+"4710255450753"},
    {id:"p37", name:"好攝力南瓜籽黑麥花膠囊",          price:800,  outOfStock:false, url:D+"4710255450654"},
    {id:"p38", name:"台灣極品靈芝多醣體膠囊",          price:800,  outOfStock:false, url:D+"4710255450289"},
  ]},
  { key:"beauty", label:"✨ 美容保養", products:[
    {id:"p39", name:"超美研膠原蛋白飲",                price:450,  outOfStock:false, url:D+"4710255450821"},
    {id:"p40", name:"輕美研膠原蛋白粉",                price:420,  outOfStock:false, url:D+"4710255450890"},
    {id:"p41", name:"外泌體保濕修護精華",              price:730,  outOfStock:false, url:D+"4710255451132"},
    {id:"p42", name:"黑棗補鐵精華飲",                  price:450,  outOfStock:false, url:D+"4710255451101"},
  ]},
  { key:"joint", label:"🦴 關節骨骼", products:[
    {id:"p43", name:"動易動非變性二型膠原蛋白",        price:1290, outOfStock:false, url:D+"0000000000117"},
  ]},
  { key:"sleep", label:"😴 睡眠", products:[
    {id:"p44", name:"好睡眠芝麻素膠囊",                price:790,  outOfStock:false, url:D+"4710255450593"},
  ]},
];
