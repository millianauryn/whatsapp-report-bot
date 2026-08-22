/**
 * Test script for LID->PN resolution logic
 */

function normalizeId(id) {
  return String(id)
    .replace(/:\d+@lid$/, '@lid')
    .replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net')
}

console.log('=== Testing normalizeId ===')
const testIds = [
  '162097098956948:3@lid',
  '162097098956948@lid',
  '6283164457305:3@s.whatsapp.net',
  '6283164457305@s.whatsapp.net',
  '204247287226396@lid',
  '95056367194249@lid',
]

testIds.forEach(function(id) {
  console.log(id + ' -> ' + normalizeId(id))
})

console.log('\n=== Testing isBot logic ===')

function isBot(id) {
  if (!id) return false
  const normalized = String(id).replace(/:\d+@/, '@').split('@')[0]
  return normalized === '6283164457305' || normalized === '162097098956948'
}

const testParticipants = [
  '162097098956948:3@lid',
  '162097098956948@lid',
  '6283164457305:3@s.whatsapp.net',
  '6283164457305@s.whatsapp.net',
  '204247287226396@lid',
  '95056367194249@lid',
  '82742662451393@lid',
  '200257262604445@lid',
]

console.log('\n=== Testing isBot (FIXED) ===')
testParticipants.forEach(function(id) {
  console.log(id + ' -> isBot: ' + isBot(id))
},

console.log('\n=== Testing reportListLines filtering ==='),

const mockDone = [
  { jid: '162097098956948:3@lid', name: 'Bot Name' },
  { jid: '204247287226396@lid', name: 'maxi' },
  { jid: '95056367194249@lid', name: 'willy' },
]

const mockDue = [
  { id: '162097098956948:3@lid' },
  { id: '204247287226396@lid' },
  { id: '95056367194249@lid' },
]

const isBotCheck = function(id) {
  if (!id) return false
  const normalized = String(id).replace(/:\d+@/, '@').split('@')[0]
  return normalized === '6283164457305' || normalized === '162097098956948'
}

const mockDone2 = [
  { jid: '162097098956948:3@lid', name: 'Bot Name' },
  { jid: '204247287226396@lid', name: 'maxi' },
  { jid: '95056367194249@lid', name: 'willy' },
]

const mockDue2 = [
  { id: '162097098956948:3@lid' },
  { id: '204247287226396@lid' },
  { id: '95056367194249@lid' },
]

const filteredDone2 = mockDone2.filter(function(r) { return !isBot(r.jid) })
const filteredDue2 = mockDue2.filter(function(p) { return !isBot(p.id) })

console.log('Original done:')
console.log(['162097098956948:3@lid', '204247287226396@lid', '95056367194249@lid'])
console.log('Filtered done:', mockDue2.filter(function(r) { return !isBot(r.jid) }).map(function(r) { return r.jid }))
console.log('Original due:')
console.log(['162097098956948:3@lid', '204247287226396@lid', '95056367194249@lid'])
console.log('Filtered due:', mockDue2.filter(function(p) { return !isBot(p.id) }).map(function(p) { return p.id }))

console.log('\n=== All tests completed ===')
