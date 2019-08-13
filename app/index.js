const puppeteer = require('puppeteer');
const aws = require('aws-sdk');
const fs = require("fs");
const readline = require('readline');
const stream = require('stream');
const logger = require('../utils/logger.js');
const secrets = require('../config/secrets.json');


const configureAws = async () => {
    aws.config.setPromisesDependency();
    aws.config.credentials = new aws.SharedIniFileCredentials({profile: 'default'})
};

const restart = async (browser) => {
    browser.close();
    await timeout(getRandomArbitrary(3000, 4000));
    await exports.start();
};

const logIn = async (browser, page) => {
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
        ])
    } catch (err) {
        logger.info(err);
        await restart(browser);
    }
};

const goToLinkedIn = async (page) => {
    try {
        await Promise.all([page.waitForNavigation('domcontentloaded'),
            page.goto('https://www.linkedin.com/login', 'domcontentloaded')
        ]);
    } catch (err) {
        logger.warn(err);
    }
};

const verifyUrl = async (page, url) => {
    if (url === page.url()) {
        return
    }
    const parsedUrl = await new URL(page.url());
    if (parsedUrl.pathname === '/feed' || parsedUrl.pathname === '/feed/') {
        throw Error('Url led to personal feed')
    } else {
        await timeout(getRandomArbitrary(3000, 4000));
        await page.evaluate(() => {
            const homeNavButton = $('.org-page-navigation__item-anchor:contains("Home")');
            homeNavButton.click();
        });
    }
};

const goToSiteSection = async (browser, page, url) => {
    try {
        await Promise.all([page.goto(url, 'domcontentloaded'), ]);
        await verifyUrl(page, url);
        await setFeedToMostRecent(page);
        await Promise.all([page.waitFor(getRandomArbitrary(6000, 10000)),
            scroll(page)
        ]);
    } catch (err) {
        logger.warn(err);
        throw err
    }
};

const setFeedToMostRecent = async (page) => {
    await timeout(getRandomArbitrary(3000, 4000));
    try {
        await Promise.all([page.waitForSelector('.sort-dropdown__icon'),
            page.click('.sort-dropdown__icon')
        ])
    } catch (err) {
        logger.warn(err) ;
        throw Error('issue setting feed to most recent');
    }
    await page.evaluate(() => {
        $('.sort-dropdown__list-item-button:contains(Recent)').click();
    });
    await timeout(getRandomArbitrary(2000, 3000))
};

const getDomAndUpload = async (page) => {
    const content = await page.content();
    const date = Date.now();
    const fileName = `${date}`;
    const params = {
        Bucket: secrets.aws.bucket,
        Key: fileName,
        Body: content
    };
    const s3 = new aws.S3();
    s3.upload(params, function(s3Err, data) {
        if (s3Err) throw s3Err;
        logger.info(`File uploaded successfully at ${data.Location}`)
    });
};

const goToSectionAndGetDom = async (browser, page, urls, count=0) => {
    for (let i = count; i < urls.length; ++count) {
        let url = urls[count];
        logger.info(`${count}: ${url}`);
        try {
            await goToSiteSection(browser, page, url);
        } catch (err) {
            logger.warn(err);
            await goToSectionAndGetDom(browser, page, urls, ++count)
        }
        await getDomAndUpload(page);
    }
};

const scroll = async (page) => {
    try {
        await page.evaluate(() => {
            const scroll = () => {
                let postDates = $('#organization-feed').find('.feed-shared-actor__sub-description');
                let postDateLength = postDates.length;
                if (postDateLength !== 0) {
                    let lastEntryDate = postDates[postDateLength - 1].textContent.trim();
                    const timeRegex = /(\d+)(m|h|d)/;
                    let match = lastEntryDate.match(timeRegex);
                    if (!match) {
                        return;
                    }
                    window.scrollTo(0, document.body.scrollHeight);
                    setTimeout(scroll, 2000)
                }
            };
            scroll();
        });
    } catch (err) {
        logger.info(err)
    }
};

async function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const getRandomArbitrary = (min, max) => {
    return Math.random() * (max - min) + min;
};

const scrapeUrls = async (browser, page, path) => {
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

exports.start = async () => {
    await configureAws();
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36');
    await goToLinkedIn(page);
    await logIn(browser, page);
    await scrapeUrls(browser, page, 'urls.txt');
};

exports.start();
