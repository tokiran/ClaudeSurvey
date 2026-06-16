const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Enter the password to hash: ', async (password) => {
  rl.close();
  if (!password) { console.error('No password entered.'); process.exit(1); }
  const hash = await bcrypt.hash(password, 10);
  console.log('\nADMIN_PASSWORD_HASH=' + hash);
  console.log('\nPaste this line into your .env file.');
});
