import github from '@actions/github';
import { Octokit } from 'octokit';
import MarkdownIt from 'markdown-it';
import sgMail from '@sendgrid/mail';

const USER_BASE = 'GET /users/{username}';
const PULL_BASE = 'GET /repos/{owner}/{repo}/pulls/{pull_number}';
const REVIEW_BASE = 'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews';

const BASE_CONFIG = {
  owner: 'adobecom',
  repo: 'milo',
  pull_number: 44,
};

function getConfig() {
  // Build URL
  return {
    owner: github.context.payload.pull_request.base.repo.owner.login,
    repo: github.context.payload.pull_request.base.repo.name,
    pull_number: github.context.payload.pull_request.number,
    release: getRelease(github.context.payload.pull_request.labels),
  }
}

function getDate(mergeDate) {
  const rawDate = new Date(mergeDate);
  const options = { timeZone: 'America/Los_Angeles', timeZoneName: 'short' };
  return `${rawDate.toDateString()} ${rawDate.toLocaleTimeString('en-US', options)}`;
}

async function sendMail(title, date, content, approvers, releasedBy, files) {
  sgMail.setApiKey(process.env.SG_KEY);
  const msg = {
    to: process.env.TO_EMAIL,
    from: {
      name: process.env.FROM_NAME,
      email: process.env.FROM_EMAIL,
    },
    templateId: process.env.SG_TEMPLATE,
    dynamicTemplateData: {
      title,
      date,
      content,
      approvers,
      releasedBy,
      files,
    },
  };

  const resp = await sgMail.send(msg);
  console.log(resp);
}

async function getName(octokit, username) {
  const user = await octokit.request(USER_BASE, { username });
  return user.data.name ? user.data.name : user.data.login;
}

function getRelease(labels) {
  return labels.find(label => label.name === 'release');
}

async function run() {
  console.log(github.context.payload.pull_request);

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const config = process.env.GITHUB_ACTIONS ? getConfig() : BASE_CONFIG;

  // Get base data
  const pull = await octokit.request(PULL_BASE, config);
  const { title, merged_at, changed_files, merged_by, body } = pull.data;

  // Get reviewer info
  const reviews = await octokit.request(REVIEW_BASE, config);
  const namePromises = reviews.data.reduce((rdx, review) => {
    if (review.state === 'APPROVED') {
      const name = getName(octokit, review.user.login);
      rdx.push(name);
    }
    return rdx;
  }, []);

  // Formatting cleanup
  const releasedBy = merged_by?.login ? await getName(octokit, merged_by.login) : null;
  const date = getDate(merged_at);
  const md = new MarkdownIt();
  const content = body ? md.render(body) : '';
  const names = await Promise.all(namePromises);
  const approvers = names.join('<br/>');

  // Log for debugging purposes
  console.log(config);
  console.log(title, date, content, approvers, releasedBy, changed_files);

  if (releasedBy && body && config.release) {
    console.log('Sending mail');
    sendMail(title, date, content, approvers, releasedBy, changed_files);
  } else {
    console.log('Something went wrong');
  }
}
run();