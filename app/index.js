const puppeteer = require('puppeteer');
const aws = require('aws-sdk');
const fs = require("fs");
const readline = require('readline');
const stream = require('stream');
const secrets = require('../config/secrets.json');


const configureAws = async() => {
    aws.config.setPromisesDependency();
    aws.config.update({
        accessKeyId: secrets.aws.access_key_ID,
        secretAccessKey: secrets.aws.secret_access_key,
        region: secrets.aws.region
    });
};

const restart = async(browser) => {
    browser.close();
    await timeout(getRandomArbitrary(3000, 4000));
    await exports.start();
};

const logIn = async(browser, page) => {
        try {
            const userNameHandle = await page.$('#username');
            const passWordHandle = await page.$('#password');
            await userNameHandle.type(secrets.linkedin.username, {
                delay: 10
            });
            await passWordHandle.type(secrets.linkedin.password, {
                delay: 10
            });
            await Promise.all([page.waitForNavigation(),
                page.click('button.btn__primary--large')
        ])} catch (err) {
            await restart(browser);
        }
};

const goToLinkedIn = async(page) => {
    try {
        await Promise.all([page.waitForNavigation('domcontentloaded'),
            page.goto('https://www.linkedin.com/login', 'domcontentloaded')
        ]);
    } catch (err) {
        console.log(err);
    }
};

const goToSiteSection = async(browser, page, url) => {
        try {
            await Promise.all([page.goto(url, 'domcontentloaded'),
        ]);
            if (page.url() !== url) {
                await timeout(getRandomArbitrary(3000, 4000));
                await page.evaluate(() => {
                    const homeNavButton = $('.org-page-navigation__item-anchor:contains("Home")');
                    homeNavButton.click();
                });
            }
            await setFeedToMostRecent(page);
            await Promise.all([page.waitFor(getRandomArbitrary(6000, 10000)),
            scroll(page)
        ])
        } catch (err) {
            console.log(err);
            await restart(browser)
        }
};

const setFeedToMostRecent = async(page) => {
    await timeout(getRandomArbitrary(3000, 4000));
    try {
        await Promise.all([page.waitForSelector('.sort-dropdown__icon'),
        page.click('.sort-dropdown__icon')
    ])
    } catch(e) {
        await timeout(getRandomArbitrary(4000, 5000));
        await setFeedToMostRecent(page)
    }
    await page.evaluate(() => {
        $('.sort-dropdown__list-item-button:contains(Recent)').click();
    });
    await timeout(getRandomArbitrary(2000, 3000))
};

const getDomAndUpload = async(page) => {
    const content = await page.content();
    const date = Date.now();
    const name = await getName(page);
    const fileName = `${date}_${name}`;
    const params = {
        Bucket: secrets.aws.bucket,
        Key: fileName,
        Body: content
    };
    const s3 = new aws.S3();
    s3.upload(params, function(s3Err, data) {
        if (s3Err) throw s3Err;
        console.log(`File uploaded successfully at ${data.Location}`)
    });
};

const goToSectionAndGetDom = async(browser, page, urls) => {
    for (let i = 0; i<urls.length; ++i) {
        let url = urls[i];
        await goToSiteSection(browser, page, url);
        await getDomAndUpload(page);
    }
};

const scroll = async(page) => {
    try {
        await page.evaluate(() => {
            const scroll = () => {
            let postDates = $('#organization-feed').find('.feed-shared-actor__sub-description');
            let postDateLength = postDates.length;
            if (postDateLength !== 0) {
                let lastEntryDate = postDates[postDateLength-1].textContent.trim();
                const timeRegex = /(\d+)(m|h|d)/;
                let match = lastEntryDate.match(timeRegex);
                if (!match){
                    return;
                }
                window.scrollTo(0, document.body.scrollHeight);
                setTimeout(scroll, 2000)
            }
        };
        scroll();
        });
    } catch(e) {
        console.log(e);
    }
};

async function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const getRandomArbitrary = (min, max) => {
    return Math.random() * (max - min) + min;
};

const getName = async(page) => {
    return page.evaluate(() => {
        let rawText = document.querySelector('.org-top-card-summary__title').textContent.trim();
        return rawText.split(' ').join('_')
    });
};

const scrapeUrls = async(browser, page, path) => {
    const instream = await fs.createReadStream(path);
    const outstream = await new stream;
    const rl = await readline.createInterface(instream, outstream);

    const urls = [];

    await rl.on('line', (line) => {
        urls.push(line);
    });
    await rl.on('close', async () => {
        await goToSectionAndGetDom(browser, page, urls);
        await browser.close()
    });
};

exports.start = async() => {
    await configureAws();
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36');
    await goToLinkedIn(page);
    await logIn(browser, page);
    await scrapeUrls(browser, page,'urls.txt');
};

exports.start();
