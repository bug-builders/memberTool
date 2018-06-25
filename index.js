const inquirer = require('inquirer');
const axios = require('axios');

const bugBuilders = 'https://main.bug.builders';

if(typeof(process.env.BUGBUILDERS_USERNAME) === 'undefined' || typeof(process.env.BUGBUILDERS_PASSWORD) === 'undefined'){
  console.log('Please specify BUGBUILDERS_USERNAME and BUGBUILDERS_PASSWORD env');
  process.exit()
}

async function listCustomers(print=true) {
  const res = await axios.get(`${bugBuilders}/customer/list`, {
    auth: {
      username: process.env.BUGBUILDERS_USERNAME,
      password: process.env.BUGBUILDERS_PASSWORD,
    }
  })

  const ret = res.data.map((customer, i) => ({...customer, value: i, name: customer.description}))
  if(print){
    ret.forEach(({name, email}) => {
      console.log(`${name} (${email})`);
    })
  }

  return ret
}

async function useSubscription() {
  const customers = await listCustomers(false);
  const { id } = await inquirer.prompt({
    type: 'list',
    name: 'id',
    message: 'Which customer ?',
    choices: customers,
  })
  const customer = customers[id];
  const subscriptions = [];

  customer.subscriptions.data.forEach(subscription => {
    subscription.items.data.forEach(item => {
      subscriptions.push({value: item.id, name: `(${item.plan.metadata.provider}) - ${item.plan.metadata.description}`})
    })
  })

  const { sId } = await inquirer.prompt({
    type: 'list',
    name: 'sId',
    message: 'Which subscription ?',
    choices: subscriptions,
  })

  const res = await axios.put(`${bugBuilders}/customer/use/${sId}`, {}, {
    auth: {
      username: process.env.BUGBUILDERS_USERNAME,
      password: process.env.BUGBUILDERS_PASSWORD,
    }
  })
}

async function createCustomer(){
  const res = await axios.post(`${bugBuilders}/customer`, {}, {
    auth: {
      username: process.env.BUGBUILDERS_USERNAME,
      password: process.env.BUGBUILDERS_PASSWORD,
    }
  })
  console.log(`https://bug.builders/Customer.html#${res.data.id}`);
}

const choiceList = {
  'List customers': listCustomers,
  'Use customer subscription': useSubscription,
  'Create customer': createCustomer,
}

inquirer.prompt({
  type: 'list',
  name: 'action',
  message: 'What do you want to do ?',
  choices: Object.keys(choiceList),
})
  .then(({action}) => choiceList[action]())
