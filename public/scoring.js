export const scoreVersion = '1.0';
export const threshold = 65;
// Protein, fibre, added sugar, saturated fat (g), and sodium (mg), per stated basis.
export const profiles = {
  snacks:[10,6,12,8,650],protein:[20,7,15,10,650],breakfast:[10,7,12,8,430],
  nuts:[12,7,11,18,420],dairy:[6,2,8,10,800],drinks:[2,1,5,3,125],
  fruit:[2,3,5,4,160],vegetables:[3,3,5,4,180],staples:[11,7,8,6,580],spreads:[20,7,13,20,650],
  dry:[7,6,8,8,200]
};
const recognized = /\b(?:oats?|oatmeal|millets?|ragi|jowar|bajra|quinoa|brown rice|whole grains?|whole wheat|beans?|chickpeas?|dal|lentils?|makhana|foxnuts?|peanuts?|almonds?|cashews?|walnuts?|pistachios?|nuts?|seeds?|dates?|raisins?|fruits?|berries|coconut water|tea leaves|water|milk|curd|yoghur?t|soybeans?|tofu|cocoa)\b/i;
const refined = /\b(?:sugars?|syrup|maltodextrin|dextrose|glucose|fructose|jaggery|honey|maida|refined (?:oil|flour)|hydrogenated|fruit juice concentrate)\b/i;
function ingredientPoints(item) {
  if (!item.ingredients) return null;
  if (item.whole) return 13;
  const first = item.ingredients.replace(/^ingredients\s*[:–-]?\s*/i,'').split(/[,;\n]/)[0];
  if (refined.test(first)) return 3;
  if (!recognized.test(first)) return 8;
  return refined.test(item.ingredients) ? 10 : 13;
}
export function scoreProduct(item) {
  const profile = profiles[item.aisle === 'drinks' && item.form === 'dry' ? 'dry' : item.aisle];
  const basis = item.basis === '100 g' || item.basis === '100 ml';
  const lines = [
    ['Protein','protein',18],['Fibre','fibre',15],['Added sugar','addedSugar',20],
    ['Saturated fat','saturatedFat',12],['Sodium','sodium',12]
  ].map(([name,key,max],i) => {
    const value = basis ? item.nutrition?.[key] : null;
    const ratio = Number.isFinite(value) ? value / profile[i] : null;
    return {name,max,points:ratio === null ? null : Math.round(max * Math.max(0,Math.min(1,i < 2 ? ratio : 1-ratio)))};
  });
  lines.push({name:'Ingredient quality',max:13,points:ingredientPoints(item)},
    {name:'Degree of processing',max:10,points:({1:10,2:8,3:5,4:1})[item.nova] ?? null});
  const complete = lines.every(line => line.points !== null);
  const value = complete ? lines.reduce((sum,line) => sum + line.points,0) : null;
  return {version:scoreVersion,value,qualified:complete ? value >= threshold : null,
    evidence:lines.filter(line=>line.points !== null).reduce((sum,line)=>sum+line.max,0),lines};
}
