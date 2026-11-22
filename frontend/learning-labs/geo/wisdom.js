// Child-friendly Scripture connections for the geography question and its artwork.
// All Scripture excerpts are from the King James Version (KJV).
// Keep the fox panel's layout unchanged: one short verse and one short connection.
const wisdom = {
 default: ['“The earth is the LORD’s, and the fulness thereof.”', 'Psalm 24:1', 'Every place we explore belongs to God. What a wonderful world He made!'],
 water: ['“The sea is his, and he made it.”', 'Psalm 95:5', 'God made the waters and the dry land. Look at the beautiful shapes they make!'],
 rivers: ['“Thou visitest the earth, and waterest it.”', 'Psalm 65:9', 'Rivers and streams bring water to so many living things.'],
 mountains: ['“My help cometh from the LORD.”', 'Psalm 121:2', 'Even the tallest mountains remind us to look to the Lord for help.'],
 living: ['“O LORD, how manifold are thy works!”', 'Psalm 104:24', 'From tiny plants to great forests, creation is full of wonders to discover.'],
 sky: ['“The heavens declare the glory of God.”', 'Psalm 19:1', 'As we look up at the sky, we can marvel at the world God made.'],
 land: ['“And God called the dry land Earth.”', 'Genesis 1:10', 'Mountains, valleys, and plains show us the wonderful variety of the land.'],
 wisdom: ['“For the LORD giveth wisdom.”', 'Proverbs 2:6', 'As you learn a new place, remember that wisdom is a gift from God.'],
 people: ['“And hath made of one blood all nations of men.”', 'Acts 17:26', 'People live in many countries and cultures, and every person matters to God.'],
 maps: ['“For the LORD giveth wisdom.”', 'Proverbs 2:6', 'Maps help us learn about the world. Keep looking closely and asking good questions!'],
 nile: ['“And the child grew, and she brought him unto Pharaoh’s daughter.”', 'Exodus 2:10', 'The Nile is a real river from the story of baby Moses in Exodus 2.'],
 israel: ['“And Jesus went about all Galilee.”', 'Matthew 4:23', 'The lands and waters we read about in the Bible are real places on our maps.'],
 deserts: ['“He led them forth by the right way.”', 'Psalm 107:7', 'God guided His people through the wilderness. We can trust Him on our journeys too.'],
 islands: ['“The sea is his, and he made it.”', 'Psalm 95:5', 'An island chain is a group of islands. Each one is part of the world God made.'],
 seasons: ['“While the earth remaineth, seedtime and harvest ... shall not cease.”', 'Genesis 8:22', 'The changing seasons remind us of God’s faithfulness.'],
 built: ['“Whatsoever ye do, do it heartily, as to the Lord.”', 'Colossians 3:23', 'People build roads, bridges, and homes. We can use our skills to serve others.'],
};

// Choose by the actual question/illustration first, not by the current score,
// so explorers receive a meaningful geographic connection with each discovery.
export function wisdomForQuestion(question) {
 const name = String(question?.target || question?.answer || '').toLowerCase();
 const topic = String(question?.topic || '').toLowerCase();
 const art = String(question?.art || '').toLowerCase();
 const clueText = (question?.clues || []).join(' ').toLowerCase();
 const text = [name,topic,art].join(' ');
 let key = 'default';
 if (/nile river/.test(name)) key='nile';
 else if (/\b(israel|jerusalem|galilee|jordan river|bethlehem|nazareth)\b/.test(name)) key='israel';
 else if (question?.islandGroup || /islands?|archipelago|reef|atoll/.test(name)) key='islands';
 else if (/mount|mountain|himalaya|andes|alps|range|peak|hill|volcano|volcanic|canyon/.test(text)) key='mountains';
 else if (/desert|sahara|wilderness|dune/.test(text)) key='deserts';
 else if (/river|brook|creek|stream|waterfall|delta|tributary|upstream|downstream/.test(text)) key='rivers';
 else if (/sea|ocean|bay|beach|cape|coast|cove|current|gulf|harbor|lake|strait|shore|tidal|wave|peninsula/.test(text)) key='water';
 else if (/rain|cloud|sky|wind|storm|atmosphere|weather|sun|moon|star/.test(text)) key='sky';
 else if (/forest|jungle|rainforest|grassland|ecosystem|habitat|plant|animal|coral|reef/.test(text)) key='living';
 else if (/season|climate/.test(text)) key='seasons';
 else if (/bridge|canal|dam|road|building|city|farm|human|man-made/.test(text)) key='built';
 else if (/map|compass|globe|latitude|longitude|equator|hemisphere|direction|scale|coordinate/.test(text)) key='maps';
 else if (/land|ice|glacier|plateau|valley|plain|isthmus|erosion|earthquake|continent/.test(text)) key='land';
 else if (question?.branch && question?.branch !== 'usa' && /country|capital|nation/.test([topic,clueText.slice(0,100)].join(' '))) key='people';
 else if (question?.branch) key='wisdom';
 const [verse,reference,connection]=wisdom[key];
 return {verse,reference,connection};
}
