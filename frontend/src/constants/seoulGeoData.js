const LON_MIN=126.76, LON_MAX=127.18, LAT_MIN=37.42, LAT_MAX=37.70;
const W=400, H=400;
export const toSvg=(lat,lon)=>[(lon-LON_MIN)/(LON_MAX-LON_MIN)*W, (1-(lat-LAT_MIN)/(LAT_MAX-LAT_MIN))*H];

export const GU_LIST = [
  {name:"종로구",  lat:37.5920, lon:126.9770},
  {name:"중구",    lat:37.5641, lon:126.9979},
  {name:"용산구",  lat:37.5340, lon:126.9900},
  {name:"성동구",  lat:37.5636, lon:127.0369},
  {name:"광진구",  lat:37.5384, lon:127.0822},
  {name:"동대문구",lat:37.5744, lon:127.0396},
  {name:"중랑구",  lat:37.6063, lon:127.0927},
  {name:"성북구",  lat:37.6066, lon:127.0176},
  {name:"강북구",  lat:37.6397, lon:127.0257},
  {name:"도봉구",  lat:37.6688, lon:127.0471},
  {name:"노원구",  lat:37.6542, lon:127.0568},
  {name:"은평구",  lat:37.6177, lon:126.9227},
  {name:"서대문구",lat:37.5794, lon:126.9368},
  {name:"마포구",  lat:37.5663, lon:126.9014},
  {name:"양천구",  lat:37.5170, lon:126.8665},
  {name:"강서구",  lat:37.5509, lon:126.8497},
  {name:"구로구",  lat:37.4955, lon:126.8876},
  {name:"금천구",  lat:37.4600, lon:126.9001},
  {name:"영등포구",lat:37.5263, lon:126.8963},
  {name:"동작구",  lat:37.5124, lon:126.9393},
  {name:"관악구",  lat:37.4784, lon:126.9516},
  {name:"서초구",  lat:37.4837, lon:127.0324},
  {name:"강남구",  lat:37.4979, lon:127.0577},
  {name:"송파구",  lat:37.5145, lon:127.1059},
  {name:"강동구",  lat:37.5301, lon:127.1238},
];

export const HANGANG_PATH = `
M 68 228 Q 100 220 132 222 Q 162 224 186 219 Q 212 215 242 217 Q 270 219 296 213 Q 320 208 350 207
L 352 217 Q 322 218 296 224 Q 270 230 242 228 Q 212 226 186 231 Q 162 236 132 233 Q 100 231 68 239 Z
`;

export function calcDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
