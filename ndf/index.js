const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const express = require('express');
const vision = require('@google-cloud/vision');
const {Storage} = require('@google-cloud/storage');

const port = 3123;
const tempDirectory = '/tmp/ndf';
const projectId = 'bug-builders'
const bucketName = 'invoice2data'

const storage = new Storage({
  projectId,
});
const visionClient = new vision.ImageAnnotatorClient();

const operations = [];

async function getGVisionResult(filename) {
  const resDir = filename.split('.pdf')[0]+'/';
  const [files] = await storage.bucket(bucketName).getFiles({prefix: resDir, delimiter: '/'})
  for(let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const [fileContent] = await file.download();
    const gvisionResult = JSON.parse(fileContent.toString('utf8'));
    gvisionResult.responses.forEach(response => {
      fs.writeFileSync(`${tempDirectory}/${filename}.gvision.txt`, response.fullTextAnnotation.text);
    })
  }
}

async function convertToText(ndfPath) {
  const files = fs.readdirSync(ndfPath);
  const requests = [];
  const resPathes = []
  for(let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const filename = path.basename(file);
    fs.copyFileSync(`${ndfPath}/${file}`, `${tempDirectory}/${filename}`)
    const dst = `${tempDirectory}/${filename}.txt`;
    const src = `${ndfPath}/${file}`;
    const argv = [src, dst];
    const pdfToText = cp.spawnSync('pdftotext', argv);
    if(pdfToText.stderr.length !== 0) {
      console.log(pdfToText.stderr.toString('utf8'))
    }
    if(pdfToText.stdout.length !== 0) {
      console.log(pdfToText.stdout.toString('utf8'))
    }

    const text = fs.readFileSync(dst);
    if(text.length < 100) {
      console.log(`${file} is not a pdf, let's try google vision instead.`);

      const resDir = filename.split('.pdf')[0]+'/';

      const [fileExists] = await storage.bucket(bucketName).file(filename).exists();
      if(!fileExists) {
        console.log(`Uploading ${filename}`)
        await storage.bucket(bucketName).upload(src);
      }
      const gsFilename = `gs://${bucketName}/${filename}`
      const [resFiles] = await storage.bucket(bucketName).getFiles({prefix: resDir});
      if(resFiles.length > 0) {
        await getGVisionResult(filename);
      } else {
        const gsDst = `gs://${bucketName}/${resDir}`
        console.log(`Start google vision analysis on ${filename}`)
        const visionClient = new vision.ImageAnnotatorClient();

        const inputConfig = {
          mimeType: 'application/pdf',
          gcsSource: {
            uri: gsFilename,
          },
        };
        const outputConfig = {
          gcsDestination: {
            uri: gsDst,
          },
        };

        const [operation] = await visionClient.asyncBatchAnnotateFiles({
          requests: [{
            inputConfig,
            features: [{type: 'DOCUMENT_TEXT_DETECTION'}],
            outputConfig,
          }]
        });

        operations.push({filename, operation});
      }
    }
  }
  return null;
}

async function operationStatus() {
  const indexToDelete = [];
  for(let i = 0; i < operations.length; i += 1) {
    const operation = operations[i];
    const [newOperation] = await visionClient.operationsClient._getOperation({name: operation.operation.latestResponse.name});
    if(newOperation.done) {
      getGVisionResult(operation.filename);
      indexToDelete.push(i);
    } else {
      console.log(`${operation.filename} in progress`)
    }
  }
  indexToDelete.forEach(i => {
    operations.splice(i, 1);
  })
}

async function start(ndfPath) {
  convertToText(ndfPath);
  setInterval(operationStatus, 3000);
  const app = express()
  app.use(express.json());
  app.use('/ndf', express.static(ndfPath, {extensions: ['pdf']}));

  app.use(express.static('ndf/public'));

  app.get('/list', function (req, res) {
    const files = fs.readdirSync(ndfPath);
    res.json(files);
  })

  app.get('/:filename', function (req, res) {
    if(req.params.filename.indexOf('/') !== -1){
      res.json({});
    } else {
      let fileContent;
      fileContent = fs.readFileSync(`${tempDirectory}/${req.params.filename}.txt`, 'utf8')
      if(fileContent.length < 100) {
        fileContent = fs.readFileSync(`${tempDirectory}/${req.params.filename}.gvision.txt`, 'utf8')
      }
      let converted = {};
      try {
        converted = JSON.parse(fs.readFileSync(`${tempDirectory}/${req.params.filename}.json`, 'utf8'))
      } catch(e) {
      }
      res.json({uri:`/ndf/${req.params.filename}`, text: fileContent.toString('utf8'), json: converted});
    }

  })

  app.post('/:filename', function (req, res) {
    if(req.params.filename.indexOf('/') !== -1){
      res.json({ok:false})
    } else {
      fs.writeFileSync(`${tempDirectory}/${req.params.filename}.json`, JSON.stringify(req.body))
      res.json({ok:true})
    }

  })

  app.listen(port, () => console.log(`NDF app listening on port ${port}!`))
}

module.exports = {start}
