import fs from "fs";
import path from "path";

const outDir = "d:/Uwian/uwian/client/public/img/3d";
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Map the icons we need in Uwian to the best matching 3d icon names in the library
const ICON_MAP = {
  mappin: "MapPin",
  shield: "Shield",
  glass: "Glass",
  cup: "Cup",
  teacup: "TeaCup",
  clock: "Clock",
  calendar: "Calendar",
  bell: "Bell",
  lock: "Lock",
  key: "Key",
  setting: "Setting",
  travel: "Travel",
  chat: "ChatText",
  money: "MoneyBag",
  wallet: "Wallet",
  star: "Star",
  fire: "Fire",
  tick: "Tick",
  zoom: "Zoom",
  target: "Target",
  trophy: "Trophy",
  boy: "Boy",
  girl: "Girl",
  crown: "Crown",
  bulb: "Bulb",
  heart: "Heart",
  mail: "Mail",
  message: "Message",
  pin: "Pin",
  plus: "Plus",
  thumbup: "ThumbUp",
  takeaway: "TakewayCup"
};

async function main() {
  console.log("Fetching 3D icons...");
  for (const [key, iconName] of Object.entries(ICON_MAP)) {
    try {
      const url = `https://unpkg.com/@nobertdev/react-3d-icons/dist/_/dynamic-color/${iconName}.js`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`Failed to fetch ${iconName}: ${res.status}`);
        continue;
      }
      const text = await res.text();
      const match = text.match(/data:image\/png;base64,([^"]+)/);
      if (match && match[1]) {
        const buf = Buffer.from(match[1], "base64");
        const outPath = path.join(outDir, `${key}.png`);
        fs.writeFileSync(outPath, buf);
        console.log(`Saved ${key}.png (${(buf.length / 1024).toFixed(1)} KB)`);
      } else {
        console.warn(`Could not extract base64 for ${iconName}`);
      }
    } catch (err) {
      console.error(`Error on ${iconName}:`, err.message);
    }
  }
}

main();
