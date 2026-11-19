import {locationQuestions,locationTrailName} from './locations.js';
import {continentBranches} from './continents.js';
import {capitalQuestions,capitalTrailName} from './capitals.js';

const europe = [
 ['France', [
  ['Paris', 'Lyon', 'Marseille', 'Which city is the capital of France?', 'The Seine flows through it.', 'The Eiffel Tower stands here.'],
  ['Seine', 'Rhine', 'Loire', 'Which river flows through Paris?', 'It reaches the English Channel in Normandy.', 'Île de la Cité lies in this river.'],
  ['Pyrenees', 'Alps', 'Jura', 'Which mountain range forms much of the border between France and Spain?', 'Andorra lies among its mountains.', 'It stretches from the Bay of Biscay toward the Mediterranean.'],
  ['Corsica', 'Sicily', 'Crete', 'Which French island lies north of Sardinia?', 'It is in the Mediterranean Sea.', 'Ajaccio is one of its main cities.'],
  ['Mediterranean Sea', 'Baltic Sea', 'North Sea', 'Which sea borders the French Riviera?', 'Nice sits on its shore.', 'It lies between Europe and Africa.'],
 ]],
 ['Germany', [
  ['Berlin', 'Munich', 'Hamburg', 'Which city is the capital of Germany?', 'The Spree flows through it.', 'The Brandenburg Gate stands here.'],
  ['Rhine', 'Elbe', 'Danube', 'Which river flows past Cologne?', 'It passes through the Netherlands before reaching the North Sea.', 'Part of it runs along the border between France and Germany.'],
  ['Danube', 'Rhine', 'Weser', 'Which river begins in Germany and reaches the Black Sea?', 'It flows through both Vienna and Budapest.', 'Its headwaters are in the Black Forest region.'],
  ['Baltic Sea', 'Adriatic Sea', 'Mediterranean Sea', 'Which sea borders Germany northeast of the North Sea coast?', 'The German island of Rügen is in it.', 'Sweden and Poland also have shores on it.'],
  ['Alps', 'Pyrenees', 'Carpathians', 'Which mountain range extends into southern Germany?', 'Germany’s highest peak, the Zugspitze, is part of it.', 'Austria lies across the border in these mountains.'],
 ]],
 ['Greece', [
  ['Athens', 'Thessaloniki', 'Patras', 'Which city is the capital of Greece?', 'It is in the region of Attica.', 'The Parthenon stands on its Acropolis.'],
  ['Crete', 'Rhodes', 'Corfu', 'Which is the largest Greek island?', 'It lies south of mainland Greece.', 'Heraklion is one of its cities.'],
  ['Aegean Sea', 'Adriatic Sea', 'Black Sea', 'Which sea lies between mainland Greece and western Turkey?', 'The Cyclades are in it.', 'Islands such as Naxos and Mykonos rise from it.'],
  ['Ionian Sea', 'Baltic Sea', 'Black Sea', 'Which sea lies off the west coast of mainland Greece?', 'Corfu lies in it.', 'It is part of the Mediterranean.'],
  ['Mount Olympus', 'Mount Etna', 'Mount Vesuvius', 'What is the highest mountain in Greece?', 'It stands in northern Greece near the Aegean coast.', 'In Greek mythology, the gods were said to live there.'],
 ]],
 ['Italy', [
  ['Rome', 'Milan', 'Florence', 'Which city is the capital of Italy?', 'The Tiber flows through it.', 'The Colosseum stands here.'],
  ['Po', 'Tiber', 'Arno', 'Which river crosses a broad plain in northern Italy?', 'It flows east toward the Adriatic Sea.', 'It passes through Turin.'],
  ['Apennines', 'Pyrenees', 'Carpathians', 'Which mountains run down much of the Italian peninsula?', 'They form its mountainous backbone.', 'They extend south from northern Italy toward Calabria.'],
  ['Sicily', 'Sardinia', 'Corsica', 'Which island lies just off the toe of Italy’s boot?', 'The Strait of Messina separates it from the mainland.', 'Mount Etna rises on its eastern side.'],
  ['Adriatic Sea', 'Baltic Sea', 'Black Sea', 'Which sea separates much of eastern Italy from the Balkan Peninsula?', 'It reaches north to the Gulf of Venice.', 'Croatia lies across it from Italy.'],
 ]],
 ['Spain', [
  ['Madrid', 'Barcelona', 'Seville', 'Which city is the capital of Spain?', 'It lies inland near the center of the country.', 'It is home to the Prado Museum.'],
  ['Portugal', 'Italy', 'Germany', 'Which country shares most of Spain’s western land border?', 'It also occupies part of the Iberian Peninsula.', 'Its capital is Lisbon.'],
  ['Ebro', 'Tagus', 'Douro', 'Which major river flows through Zaragoza?', 'It reaches the Mediterranean Sea.', 'Its delta lies on the coast of Catalonia.'],
  ['Canary Islands', 'Balearic Islands', 'Azores', 'Which Spanish islands lie in the Atlantic off northwestern Africa?', 'Tenerife is part of this group.', 'Mount Teide rises on one of these islands.'],
  ['Strait of Gibraltar', 'English Channel', 'Strait of Messina', 'Which passage separates southern Spain from northern Morocco?', 'At its narrowest, Europe and Africa are close across the water.', 'It connects the Atlantic Ocean and Mediterranean Sea.'],
 ]],
 ['United Kingdom', [
  ['London', 'Edinburgh', 'Cardiff', 'Which city is the capital of the United Kingdom?', 'It is in southeastern England.', 'The Houses of Parliament stand beside the Thames here.'],
  ['Thames', 'Severn', 'Mersey', 'Which river flows through central London?', 'It passes under Tower Bridge.', 'Its estuary opens toward the North Sea.'],
  ['Scotland', 'Wales', 'Northern Ireland', 'Which part of the United Kingdom is north of England?', 'It includes the Highlands.', 'Its capital is Edinburgh.'],
  ['Wales', 'Scotland', 'Northern Ireland', 'Which part of the United Kingdom lies west of England on Great Britain?', 'It includes the mountains of Eryri, also called Snowdonia.', 'Its capital is Cardiff.'],
  ['English Channel', 'Irish Sea', 'Baltic Sea', 'Which stretch of water separates southern England from northern France?', 'The Strait of Dover is its narrow eastern end.', 'The Channel Tunnel passes beneath it.'],
 ]],
];

const usa = [
 ['Northeast', [
  ['Maine', 'Vermont', 'Connecticut', 'Which New England state borders both New Hampshire and Canada?', 'It has an Atlantic coastline.', 'Acadia National Park is here.'],
  ['Hudson River', 'Mississippi River', 'Ohio River', 'Which river flows along the west side of Manhattan?', 'It flows south through eastern New York.', 'It reaches New York Harbor.'],
  ['Boston', 'Providence', 'Hartford', 'Which city is the capital of Massachusetts?', 'It is a port on the Atlantic coast.', 'The Charles River reaches its harbor.'],
  ['Lake Ontario', 'Lake Michigan', 'Lake Superior', 'Which Great Lake lies directly north of much of western New York?', 'The Niagara River flows into it.', 'The St. Lawrence River flows out of it.'],
  ['Pennsylvania', 'Maine', 'Rhode Island', 'Which state contains both Philadelphia and Pittsburgh?', 'It extends from the Delaware River to Lake Erie.', 'Its capital is Harrisburg.'],
 ]],
 ['Southeast', [
  ['Florida', 'Georgia', 'Alabama', 'Which state extends into a large peninsula at the southeastern tip of the mainland?', 'The Everglades are near its southern end.', 'A chain of islands called the Keys curves away from it.'],
  ['Tallahassee', 'Miami', 'Orlando', 'Which city is the capital of Florida?', 'It is in the Florida Panhandle.', 'It lies inland, near the Georgia border.'],
  ['Appalachian Mountains', 'Rocky Mountains', 'Sierra Nevada', 'Which mountain system includes the Blue Ridge?', 'It runs through parts of the eastern United States.', 'The Great Smoky Mountains belong to it.'],
  ['Louisiana', 'Virginia', 'Kentucky', 'In which state does the Mississippi River reach the Gulf?', 'The river flows past New Orleans on its way there.', 'Baton Rouge is its capital.'],
  ['Georgia', 'South Carolina', 'Mississippi', 'Which state lies immediately north of Florida’s Atlantic coast?', 'The Savannah River forms much of its eastern border.', 'Its capital is Atlanta.'],
 ]],
 ['Midwest', [
  ['Lake Michigan', 'Lake Erie', 'Lake Superior', 'Which Great Lake lies between Wisconsin and most of Michigan’s Lower Peninsula?', 'Chicago is on its shore.', 'It is the only Great Lake entirely within the United States.'],
  ['Minnesota', 'Iowa', 'Ohio', 'In which state does the Mississippi River begin?', 'It starts at Lake Itasca.', 'The Twin Cities are in this state.'],
  ['Mississippi River', 'Colorado River', 'Hudson River', 'Which river forms Iowa’s eastern border?', 'It flows past St. Louis farther south.', 'It reaches the Gulf through Louisiana.'],
  ['Wisconsin', 'Indiana', 'Nebraska', 'Which state west of Michigan’s Upper Peninsula borders both Lake Superior and Lake Michigan?', 'Green Bay is on its eastern side.', 'Its capital is Madison.'],
  ['Des Moines', 'Lincoln', 'Columbus', 'Which city is the capital of Iowa?', 'It shares a name with a river that flows through the city.', 'It is in central Iowa.'],
 ]],
 ['Southwest', [
  ['Arizona', 'Texas', 'Oklahoma', 'Which state contains Grand Canyon National Park?', 'The Colorado River runs through the canyon.', 'Phoenix is the state capital.'],
  ['Rio Grande', 'Colorado River', 'Red River', 'Which river forms much of the border between Texas and Mexico?', 'It flows past El Paso.', 'It reaches the Gulf near Brownsville.'],
  ['Santa Fe', 'Phoenix', 'Austin', 'Which city is the capital of New Mexico?', 'It sits near the southern Rocky Mountains.', 'It is northeast of Albuquerque.'],
  ['Texas', 'Arizona', 'New Mexico', 'Which southwestern state has a Gulf coast?', 'It borders Louisiana to the east.', 'Its capital is Austin.'],
  ['Sonoran Desert', 'Great Basin Desert', 'Chihuahuan Desert', 'Which desert around Tucson is known for giant saguaro cacti?', 'It extends into northwestern Mexico.', 'Saguaro National Park protects part of it.'],
 ]],
 ['West', [
  ['Rocky Mountains', 'Appalachian Mountains', 'Cascade Range', 'Which mountains run through central Colorado?', 'Many peaks there exceed 14,000 feet.', 'The range extends north into Canada.'],
  ['California', 'Oregon', 'Nevada', 'Which state contains Yosemite National Park?', 'Yosemite is in the Sierra Nevada.', 'The state capital is Sacramento.'],
  ['Columbia River', 'Colorado River', 'Rio Grande', 'Which river forms much of the Washington–Oregon border?', 'It passes through a gorge in the Cascade Range.', 'It empties into the Pacific Ocean.'],
  ['Alaska', 'Washington', 'Montana', 'Which state contains Denali, the highest peak in North America?', 'It borders Canada but no other U.S. state.', 'Its capital is Juneau.'],
  ['Hawaii', 'Alaska', 'California', 'Which U.S. state is an island chain in the central Pacific?', 'Active volcanoes have shaped its largest island.', 'Honolulu is its capital.'],
 ]],
 ['U.S. overview', [
  ['Washington, D.C.', 'New York City', 'Philadelphia', 'Which city is the national capital of the United States?', 'It is on the Potomac River.', 'The U.S. Capitol stands here.'],
  ['Canada', 'Mexico', 'Cuba', 'Which country borders the contiguous United States to the north?', 'It shares the Great Lakes with the United States.', 'It also borders Alaska.'],
  ['Mexico', 'Canada', 'Guatemala', 'Which country shares a land border with California and Texas?', 'It lies to the south of the contiguous United States.', 'Part of its border with the United States follows the Rio Grande.'],
  ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Which ocean borders the West Coast of the contiguous United States?', 'California, Oregon, and Washington all have shores on it.', 'Hawaii lies in this ocean.'],
  ['Atlantic Ocean', 'Pacific Ocean', 'Arctic Ocean', 'Which ocean borders the East Coast of the contiguous United States?', 'It lies east of Maine and the Carolinas.', 'It separates North America from Europe and much of Africa.'],
 ]],
];

const geographicBranches = {
 ...continentBranches,
 europe: {name:'Europe', focusLabel:'Country', trails:europe},
 usa: {name:'United States', focusLabel:'Region', trails:usa},
};

export const placeBranches = Object.fromEntries(Object.entries(geographicBranches).map(([id, branch])=>[
 id, {...branch, name:id==='australia'?'Australia & Oceania':branch.name, focusLabel:'Trail', trails:[...branch.trails, [capitalTrailName(id)], ...(id==='antarctica'?[]:[[locationTrailName]])]},
]));

const alternateNames = {
 'Washington, D.C.':['Washington DC','Washington','DC','District of Columbia'],
 Seine:['Seine River'], Rhine:['Rhine River'], Danube:['Danube River'],
 Po:['Po River','River Po'], Ebro:['Ebro River','River Ebro'], Thames:['Thames River','River Thames'],
 'Amazon River':['Amazon'], 'Yangtze River':['Yangtze','Chang Jiang'],
 'Nile River':['Nile'], 'Mount Kilimanjaro':['Kilimanjaro'], 'Galápagos Islands':['Galápagos'],
 'Mount Olympus':['Olympus'], 'Appalachian Mountains':['Appalachians'],
 'Rocky Mountains':['Rockies'], 'Sonoran Desert':['Sonora Desert'],
};

// These published trail blocks keep saved question IDs stable as new trails are appended.
function makePlaceQuestions(branch, firstId, trails) {
 return trails.flatMap(([place, questions], trailIndex) => questions.map(([answer, second, third, ...clues], index) => {
  const choices = [answer, second, third];
  const offset = (trailIndex + index) % choices.length;
  return {
   id: `g${firstId + trailIndex * 100 + index}`,
   branch, place, topic:place, answer, clues, acceptedAnswers:alternateNames[answer],
   choices:[...choices.slice(offset), ...choices.slice(0, offset)],
  };
 }));
}
// Use the same boundary and pin placement when a geography trail revisits a capital.
const capitalById = new Map(capitalQuestions.map(question=>[question.id,question.capitalMap]));
const recurringCapitals = {
 g1000:'country-fr', g1100:'country-de', g1200:'country-gr', g1300:'country-it',
 g1400:'country-es', g1500:'country-gb', g2002:'state-25', g2101:'state-12',
 g2204:'state-19', g2302:'state-35', g2500:'country-us', g7002:'country-au',
};
const geographicQuestions = [
 ...makePlaceQuestions('europe', 1000, europe),
 ...makePlaceQuestions('usa', 2000, usa),
 ...Object.entries(continentBranches).flatMap(([id,{firstId,trails}])=>makePlaceQuestions(id,firstId,trails)),
];
export const placeQuestions = [
 ...geographicQuestions.map(question=>{
  const capitalMap = capitalById.get(recurringCapitals[question.id]);
  return capitalMap ? {...question, capitalMap} : question;
 }),
 ...capitalQuestions,
 ...locationQuestions,
];
