import { formatDestinationJid } from './handler';

function testFormatDestinationJid() {
  console.log('🧪 Test formatDestinationJid...');

  // 1. Format international avec +
  const res1 = formatDestinationJid('+33612345678', 'self@s.whatsapp.net');
  console.assert(res1 === '33612345678@s.whatsapp.net', `Échec test 1: ${res1}`);

  // 2. Format brut sans +
  const res2 = formatDestinationJid('33612345678', 'self@s.whatsapp.net');
  console.assert(res2 === '33612345678@s.whatsapp.net', `Échec test 2: ${res2}`);

  // 3. JID complet déjà formaté
  const res3 = formatDestinationJid('33612345678@s.whatsapp.net', 'self@s.whatsapp.net');
  console.assert(res3 === '33612345678@s.whatsapp.net', `Échec test 3: ${res3}`);

  // 4. Numéro vide (doit renvoyer le self JID de l'utilisateur)
  const res4 = formatDestinationJid('', '33799887766:12@s.whatsapp.net');
  console.assert(res4 === '33799887766@s.whatsapp.net', `Échec test 4: ${res4}`);

  // 5. Numéro nul (doit renvoyer le self JID de l'utilisateur)
  const res5 = formatDestinationJid(null, '33799887766@s.whatsapp.net');
  console.assert(res5 === '33799887766@s.whatsapp.net', `Échec test 5: ${res5}`);

  console.log('✅ Tous les tests formatDestinationJid ont réussi !');
}

testFormatDestinationJid();
