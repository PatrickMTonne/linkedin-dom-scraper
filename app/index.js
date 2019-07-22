const puppeteer = require('puppeteer');
const aws = require('aws-sdk');
const fs = require("fs");
const readline = require('readline');
const stream = require('stream');
const awsConfig = require('../config/aws_config.json');
const linkedInConfig = require('../config/linkedin_config');


const configureAws = async () => {
    aws.config.setPromisesDependency();
    aws.config.update({
        accessKeyId: awsConfig.credentials.access_key_ID,
        secretAccessKey: awsConfig.credentials.secret_access_key,
        region: awsConfig.credentials.region
    });
};

const logIn = async (page) => {
    if (await page.$('a.nav__button-secondary') !== null) {
        try {
            await Promise.all([page.waitForNavigation('domcontentloaded'),
                page.click('a.nav__button-secondary')
            ]);
        } catch (err) {
            console.log(err);
            await logIn(page);
        }
        try {
            const userNameHandle = await page.$('#username');
            const passWordHandle = await page.$('#password');
            await userNameHandle.type(linkedInConfig.credentials.username, {
                delay: 10
            });
            await passWordHandle.type(linkedInConfig.credentials.password, {
                delay: 10
            });
            await Promise.all([page.waitForNavigation(),
                page.click('button.btn__primary--large')
        ])} catch (err) {
            console.log('uh oh boi');
            await logIn(page);
        }
    } else {
        console.log('could not log in');
    }
};

const goToLinkedIn = async (page) => {
    try {
        await Promise.all([page.waitForNavigation('domcontentloaded'),
            page.goto('https://www.linkedin.com/', 'domcontentloaded')
        ]);
    } catch (err) {
        console.log(err);
    }
};

const goToSiteSection = async (page, url) => {
        try {
            await Promise.all([page.goto(url, 'domcontentloaded'),
            setFeedToMostRecent(page),
        ]);
            await Promise.all([page.waitFor(getRandomArbitrary(5000, 10000)),
            scroll(page)
        ])
        } catch (err) {
            console.log(err);
        }
};

const setFeedToMostRecent = async (page) => {
    await timeout(3000);
    try {
        await Promise.all([page.waitForSelector('.sort-dropdown__icon'),
        page.click('.sort-dropdown__icon')
    ])
    } catch(e) {
        await timeout(5000);
        await setFeedToMostRecent(page)
    }
    await page.evaluate(() => {
        $('.sort-dropdown__list-item-button:contains(Recent)').click();
    });
    await timeout(2000)
};

const getDomAndUpload = async (page) => {
    const content = await page.content();
    const date = Date.now();
    const fileName = `${date}.html`;
    await fs.writeFile(fileName, content, (err) => {
        if (err) throw err;
        uploadFile(fileName);
    });
};

const uploadFile = (file) => {
    const s3 = new aws.S3();
    fs.readFile(file, 'utf-8', (err, data) => {
        if (err) throw err;
        const params = {
            Bucket: awsConfig.credentials.bucket,
            Key: file,
            Body: data
        };
        s3.upload(params, function(s3Err, data) {
            if (s3Err) throw s3Err;
            console.log(`File uploaded successfully at ${data.Location}`)
        });
    });
};

const goToSectionAndGetDom = async (page, urls) => {
    for (let i = 0; i<urls.length; ++i) {
        await console.log(page);
        let url = urls[i];
        await goToSiteSection(page, url);
        await getDomAndUpload(page);
    }
};

const scroll = async (page) => {
    await page.evaluate(() => {
            const scroll = () => {
            let postDates = $('#organization-feed').find('.feed-shared-actor__sub-description');
            let postDateLength = postDates.length;
            let lastEntryDate = postDates[postDateLength-1].textContent.trim();

            const timeRegex = /(\d+)(m|h|d)/;
            let match = lastEntryDate.match(timeRegex);
            if (!match){
                return;
            }
            window.scrollTo(0, document.body.scrollHeight);
            setTimeout(scroll, 2000)
        };
        scroll();
    });
};

async function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const getRandomArbitrary = (min, max) => {
    return Math.random() * (max - min) + min;
};

const readUrls = async (page, path) => {
    const instream = await fs.createReadStream(path);
    const outstream = await new stream;
    const rl = await readline.createInterface(instream, outstream);

    const urls = [];

    await rl.on('line', (line) => {
        urls.push(line);
    });
    await rl.on('close', async () => {
        await goToSectionAndGetDom(page, urls);
    });
};


(async () => {
    await configureAws();
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36');
    await goToLinkedIn(page);
    await logIn(page);
    await readUrls(page,'urls.txt');
    // await browser.close();
})();