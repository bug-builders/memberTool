function amount(value) {
  let newValue = value.replace(',', '.');
  newValue = newValue.replace(new RegExp(' ', 'g'), '');

  if(newValue.indexOf('.') !== -1) {
    newValue = parseFloat(newValue);
    newValue = parseInt(newValue*100)
  } else {
    newValue = parseInt(newValue);
  }
  return newValue;
}

function date(value, index = 0) {
  let newValue = moment(value);
  let i = index;
  const commonFormat = [
    'DD/MM/YYYY',
  ]
  console.log(value);
  while(!newValue.isValid() && i < commonFormat.length) {
    newValue = moment(value, commonFormat[i]);
    i += 1;
  }

  return newValue;
}

window.addEventListener('load', () => {
  fetch('/list')
    .then(res => res.json())
    .then(files => {
      loadInvoice(location.hash.replace('#', '').length > 0 ? location.hash.replace('#', '') : files[0]);
      // const list = document.getElementById('list');
      $.each(files, function(index, value) {
        $('<a />', {
          'text': value,
          'class': 'col',
          'href': '#'+value
        }).appendTo('#list');
      });
    })

  const selectedTextInput = document.getElementById('selectedText');
  const select = document.getElementById('exampleFormControlSelect1');

  selectedTextInput.addEventListener('keyup', parse)

  document.getElementById('exampleFormControlSelect1').addEventListener('change', parse)

  const saveBtn = document.getElementById('saveChanges');
  saveBtn.addEventListener('click', event => {
    if(select.value.startsWith('amount_')) {
      const amount_guessed = amount(selectedTextInput.value);
      document.getElementById(select.value).value = amount_guessed
    } else if(select.value === 'date') {
      const date_guessed = date(selectedTextInput.value);
      document.getElementById(select.value).value = date_guessed.format()
    } else {
      document.getElementById(select.value).value = selectedTextInput.value
    }
  })

  document.getElementById('saveJson').addEventListener('click', event => {
    fetch(`/${document.getElementById('invoiceFilename').value}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        amount_total: parseInt(document.getElementById('amount_total').value, 10),
        amount_taxes: parseInt(document.getElementById('amount_taxes').value, 10),
        date: document.getElementById('date').value,
        invoice_id: document.getElementById('invoice_id').value,
        issuer: document.getElementById('issuer').value,
      })
    }).then(() => {
      alert('ok');
    })
  })
})

function parse() {
  const select = document.getElementById('exampleFormControlSelect1');
  const selectedTextInput = document.getElementById('selectedText');

  if(select.value.startsWith('amount_')) {
    const amount_guessed = amount(selectedTextInput.value);
    $('#exampleFormControlInput1').text((amount_guessed/100).toLocaleString('fr-FR', {style: 'currency', currency: 'EUR'}))
  } else if(select.value === 'date') {
    const date_guessed = date(selectedTextInput.value);
    $('#exampleFormControlInput1').text(date_guessed.toLocaleString('fr-FR'))
  } else {
    $('#exampleFormControlInput1').text(selectedTextInput.value)
  }
}

function loadInvoice(id) {
  document.getElementById('invoiceFilename').value = id;
  document.getElementById('title').value = '';
  document.getElementById('description').value = '';
  document.getElementById('amount_total').value = '';
  document.getElementById('amount_taxes').value = '';
  document.getElementById('date').value = '';
  document.getElementById('invoice_id').value = '';
  document.getElementById('issuer').value = '';
  fetch(`/${id}`)
    .then(res => res.json())
    .then(content => {
      const embed = document.getElementById('embed');
      const text = document.getElementById('totext');
      embed.src = content.uri;
      text.value = content.text;

      text.addEventListener('select', event => {
        const selectedText = (event.target.value).substring(event.target.selectionStart, event.target.selectionEnd);

        $('#exampleModalCenter').modal({backdrop: 'static', keyboard: false})
        $('#selectedText').val(selectedText)

      })

      Object.keys(content.json).forEach(key => {
        document.getElementById(key).value = content.json[key];
      })
    })
}

window.onhashchange = (event) => {
  loadInvoice(location.hash.replace('#', ''))
}



// embed.src
