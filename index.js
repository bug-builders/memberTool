const cp = require('child_process');
const crypto = require('crypto');
const forge = require('node-forge');
const fs = require('fs');
const inquirer = require('inquirer');
const axios = require('axios');
const glob = require('glob');

const bugBuilders = 'https://main.bug.builders';
// const bugBuilders = 'http://127.0.0.1:3000';

if (
  typeof process.env.BUGBUILDERS_USERNAME === 'undefined' ||
  typeof process.env.BUGBUILDERS_PASSWORD === 'undefined'
) {
  console.log(
    'Please specify BUGBUILDERS_USERNAME and BUGBUILDERS_PASSWORD env',
  );
  process.exit();
}

function asciiToHexString(str) {
  return str
    .split('')
    .map(c => `0${c.charCodeAt(0).toString(16)}`.slice(-2))
    .join('');
}

function hexStringToAscii(hexx) {
  const hex = hexx.toString();
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}

function sign(datas, key) {
  const pss = forge.pss.create({
    md: forge.md.sha256.create(),
    mgf: forge.mgf.mgf1.create(forge.md.sha256.create()),
    saltLength: 32,
  });

  const md = forge.md.sha256.create();
  md.update(datas, 'utf8');

  const signature = key.sign(md, pss);

  return asciiToHexString(signature);
}

async function listCustomers(print = true) {
  const res = await axios.get(`${bugBuilders}/customer/list`, {
    auth: {
      username: process.env.BUGBUILDERS_USERNAME,
      password: process.env.BUGBUILDERS_PASSWORD,
    },
  });

  const ret = res.data.map((customer, i) => ({
    ...customer,
    value: i,
    name: customer.description,
  }));
  if (print) {
    ret.forEach(({ name, email }) => {
      console.log(`${name} (${email})`);
    });
  }

  return ret;
}

async function useSubscription() {
  const customers = await listCustomers(false);
  const { id } = await inquirer.prompt({
    type: 'list',
    name: 'id',
    message: 'Which customer ?',
    choices: customers,
  });
  const customer = customers[id];
  const subscriptions = [];

  customer.subscriptions.data.forEach(subscription => {
    subscription.items.data.forEach(item => {
      subscriptions.push({
        value: item.id,
        name: `(${item.plan.metadata.provider}) - ${
          item.plan.metadata.description
        }`,
      });
    });
  });

  const { sId } = await inquirer.prompt({
    type: 'list',
    name: 'sId',
    message: 'Which subscription ?',
    choices: subscriptions,
  });

  const res = await axios.put(
    `${bugBuilders}/customer/use/${sId}`,
    {},
    {
      auth: {
        username: process.env.BUGBUILDERS_USERNAME,
        password: process.env.BUGBUILDERS_PASSWORD,
      },
    },
  );
}

async function createCustomer() {
  const res = await axios.post(
    `${bugBuilders}/customer`,
    {},
    {
      auth: {
        username: process.env.BUGBUILDERS_USERNAME,
        password: process.env.BUGBUILDERS_PASSWORD,
      },
    },
  );
  console.log(`https://bug.builders/Customer.html#${res.data.id}`);
}

async function createDevis() {
  const { name } = await inquirer.prompt({
    type: 'input',
    name: 'name',
    message: "What's your job title ?",
  });

  const { description } = await inquirer.prompt({
    type: 'input',
    name: 'description',
    message: "What's your job description ?",
  });

  const { amount } = await inquirer.prompt({
    type: 'input',
    name: 'amount',
    message: "What's your cost per day ?",
  });

  const amountCent = parseFloat(amount) * 100;

  const validation = `You'll do ${name} for ${amountCent / 100} € per day ?`;

  const { ok } = await inquirer.prompt({
    type: 'list',
    name: 'ok',
    message: validation,
    choices: ['Yes', 'No'],
  });

  if (ok === 'Yes') {
    const res = await axios.post(
      `${bugBuilders}/customer/devis`,
      {
        name,
        description,
        amount: amountCent,
      },
      {
        auth: {
          username: process.env.BUGBUILDERS_USERNAME,
          password: process.env.BUGBUILDERS_PASSWORD,
        },
      },
    );

    console.log(`https://bug.builders/Devis.html#CUSTOMER_ID/${res.data.id}`);

    const customers = await listCustomers(false);
    const { id } = await inquirer.prompt({
      type: 'list',
      name: 'id',
      message: 'For which customer ?',
      choices: customers,
    });
    const customer = customers[id];
    console.log(
      `https://bug.builders/Devis.html#${customer.id}/${res.data.id}`,
    );
  } else {
    createDevis();
  }
}

async function signFile(filename) {
  const certs = fs
    .readdirSync(`${process.env['HOME']}/.ssh/`)
    .filter(f => f.includes('.pub'))
    .map(f => f.replace('.pub', ''));

  let cert;
  if (certs.length > 1) {
    ({ cert } = await inquirer.prompt({
      type: 'list',
      name: 'cert',
      message: 'Which certificate do you wish to use ?',
      choices: certs,
    }));
  } else {
    cert = certs[0];
  }

  const pkeyFile = `${process.env['HOME']}/.ssh/${cert}`;

  const pkey = fs.readFileSync(pkeyFile, 'utf8');
  const privateKey = forge.pki.privateKeyFromPem(pkey);
  // const privateKey = forge.pki.decryptRsaPrivateKey(pem, 'password');

  const sigFilename = `${filename}.sig`;
  let sigFile;
  try {
    sigFile = JSON.parse(fs.readFileSync(sigFilename, 'utf8'));
  } catch (err) {
    sigFile = {};
  }

  const res = await axios.get(
    `https://api.github.com/orgs/bug-builders/members`,
  );
  const members = res.data.map(member => ({
    value: member.login,
    name: member.login,
  }));

  const { who } = await inquirer.prompt({
    type: 'list',
    name: 'who',
    message: 'Who are you ?',
    choices: members,
  });

  if (typeof sigFile[who] !== 'undefined') {
    console.log(`${who} already signed this file.`);
    const { ok } = await inquirer.prompt({
      type: 'list',
      name: 'ok',
      message: `Do you want to replace it ?`,
      choices: ['Yes', 'No'],
    });
    if (ok === 'No') {
      process.exit();
    }
  }

  const sha = cp
    .execFileSync('git', ['hash-object', filename])
    .toString()
    .trim();
  const signature = sign(sha, privateKey);
  sigFile[who] = signature;

  fs.writeFileSync(sigFilename, JSON.stringify(sigFile));
  console.log(`${sigFilename} updated`);
}

const choiceList = {
  'List customers': listCustomers,
  'Use customer subscription': useSubscription,
  'Create customer': createCustomer,
  'Create devis': createDevis,
};

if(process.argv[2] === 'sign'){
  signFile(process.argv[3]);
} else {
  inquirer
    .prompt({
      type: 'list',
      name: 'action',
      message: 'What do you want to do ?',
      choices: Object.keys(choiceList),
    })
    .then(({ action }) => choiceList[action]());

}

