import maps from './location-map-data.json' with {type:'json'};

export const locationTrailName = 'Find it on the Map';

const cluesByRegion = {
 usa:{
  Iowa:['Look in the Midwest, in the middle of the country.','Look east of Nebraska and north of Missouri.','The Mississippi River runs along my eastern edge.'],
  Nebraska:['Look in the middle of the country.','Look just north of Kansas.','Iowa is just across the Missouri River to my east.'],
  Kansas:['Look in the broad plains in the middle of the country.','Look directly below Nebraska.','I’m between Colorado to the west and Missouri to the east.'],
  Minnesota:['Look in the upper Midwest.','I touch Canada and Lake Superior.','I’m directly north of Iowa.'],
 },
 'north-america':{
  Canada:['Look toward the top of the map.','My shores touch the Arctic, Atlantic, and Pacific oceans.','I’m directly north of most of the United States.'],
  'United States':['Look for a country with both Atlantic and Pacific shores.','Most of my states are between Canada and Mexico.','Alaska and Hawaii are also part of me.'],
  Mexico:['Look where the continent gets narrower toward the south.','I touch both the Pacific Ocean and the Gulf of Mexico.','I’m just south of the United States.'],
  Cuba:['Look in the Caribbean Sea.','I’m a long island south of Florida.','I’m east of Mexico’s Yucatán Peninsula.'],
 },
 'south-america':{
  Brazil:['Look for the biggest country on this map.','The Amazon River flows across my north.','I take up much of the eastern side of South America.'],
  Argentina:['Look toward the southern end of the continent.','The Andes run along much of my western edge.','I’m just east of Chile.'],
  Peru:['Look along the Pacific coast, on the west.','The Andes run through my land.','I’m south of Ecuador and north of Chile.'],
  Colombia:['Look in the northwest of the continent.','My coast touches both the Pacific Ocean and the Caribbean Sea.','Panama meets South America at my border.'],
 },
 europe:{
  France:['Look in western Europe.','The English Channel is along my northern coast.','I’m north of Spain and west of Germany.'],
  Spain:['Look in the southwest corner of Europe.','I share a peninsula with Portugal.','The Pyrenees help separate me from France.'],
  Italy:['Look for a country that reaches into the Mediterranean Sea.','Part of my mainland looks like a boot.','Sicily sits near the toe of that boot.'],
  Germany:['Look in central Europe.','I touch the North Sea and the Baltic Sea.','I’m east of France and west of Poland.'],
 },
 africa:{
  Egypt:['Look in northeastern Africa.','The Nile River flows north through me.','I’m east of Libya and north of Sudan.'],
  Nigeria:['Look in West Africa.','My southern coast faces the Gulf of Guinea.','I’m directly west of Cameroon and south of Niger.'],
  Kenya:['Look in eastern Africa near the equator.','My coast faces the Indian Ocean.','I’m north of Tanzania and south of Ethiopia.'],
  'South Africa':['Look at the lower end of the continent.','I have coasts on the Atlantic and Indian oceans.','The small country of Lesotho is entirely inside my borders.'],
 },
 asia:{
  China:['Look for a large country in eastern Asia.','Mongolia is to my north.','I’m north of Vietnam and west of Korea.'],
  India:['Look in southern Asia.','The Himalayas rise along part of my northern edge.','I reach into the Indian Ocean, just north of Sri Lanka.'],
  Japan:['Look just off the eastern edge of mainland Asia.','I’m a chain of islands in the Pacific Ocean.','The Sea of Japan lies between my islands and Korea.'],
  'Saudi Arabia':['Look in southwestern Asia.','The Red Sea lies along my western coast.','I cover most of the Arabian Peninsula.'],
 },
 australia:{
  Australia:['Look for the largest landmass on this map.','I’m south of Papua New Guinea.','New Zealand is across the Tasman Sea to my southeast.'],
  'New Zealand':['Look southeast of Australia.','Two long islands make up most of my land.','The Tasman Sea is between me and Australia.'],
  'Papua New Guinea':['Look just north of Australia.','I share a large island with Indonesia.','I’m on the eastern half of that island.'],
  Fiji:['Look out in the Pacific, east of Australia.','I’m a group of islands well north of New Zealand.','I’m east of Vanuatu and west of Tonga.'],
 },
};

export const locationMaps = maps;

export const locationQuestions = Object.entries(cluesByRegion).flatMap(([branch, entries])=>{
 const places = Object.keys(entries);
 return places.map((target, index)=>{
  const correctIndex = (index+1)%3;
  const locations = [places[(index+1)%places.length],places[(index+2)%places.length]];
  locations.splice(correctIndex,0,target);
  const choices = ['1','2','3'];
  const answer = choices[correctIndex];
  const clues = entries[target];
  return {
   id:'location-'+target.toLowerCase().replaceAll(' ','-')+'-'+branch,
   branch, place:locationTrailName, topic:locationTrailName, target, locations,
   choices, answer, clues,
   explanation:`Marker ${answer} shows ${target}. The last clue is a way to remember where it is: “${clues[2]}”`,
  };
 });
});
