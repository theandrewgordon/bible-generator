import {capitalMapData} from './capital-map-data.js';

export function capitalTrailName(branch) {
 if (branch==='usa') return 'State Capitals';
 if (branch==='antarctica') return 'Countries and Capitals';
 return 'Country Capitals';
}

export const capitalQuestions = Object.entries(capitalMapData).flatMap(([branch, rows]) => {
 const place = capitalTrailName(branch);
 const answers = [...new Set(rows.map(([, , answer])=>answer))];
 return rows.map(([id, jurisdiction, answer, outline, marker, clues, acceptedAnswers], index) => {
  const capitalMap = {outline, marker};
  if (branch==='antarctica') {
   return {
    id, branch, place, capitalMap, answer:'No countries or capitals',
    choices:['Countries and capitals','No countries or capitals','Countries without capitals'],
    clues:[
     'Are there any countries or capital cities in Antarctica?',
     'People from many countries work at research stations there.',
     'Research stations are bases for science. Antarctica has no countries of its own, so it has no national capitals.',
    ],
    acceptedAnswers:['No','None','Neither','There are no countries or capitals'],
   };
  }
  const alternatives = answers.filter(city=>city!==answer);
  const offset = index % alternatives.length;
  const options = [answer, alternatives[offset], alternatives[(offset+5)%alternatives.length]];
  const rotation = index % options.length;
  return {
   id, branch, place, capitalMap, answer, acceptedAnswers,
   choices:[...options.slice(rotation), ...options.slice(0,rotation)],
   clues:clues||[
    `Which city is the capital of ${jurisdiction}?`,
    'The star marks the capital on the map.',
    `The name of the starred city begins with ${answer[0]}.`,
   ],
  };
 });
});
