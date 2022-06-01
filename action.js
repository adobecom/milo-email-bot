import github from '@actions/github';
import { Octokit } from 'octokit';
import MarkdownIt from 'markdown-it';
import sgMail from '@sendgrid/mail';

const PULL_BASE = 'GET /repos/{owner}/{repo}/pulls/{pull_number}';
const REVIEW_BASE = 'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews';

const BASE_CONFIG = {
  owner: 'adobecom',
  repo: 'milo',
  pull_number: 34,
};

function getConfig() {
  // Build URL
  return {
    owner: github.context.payload.pull_request.head.repo.owner.login,
    repo: github.context.payload.pull_request.head.repo.name,
    pull_number: github.context.payload.pull_request.number
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

async function run() {
  console.log(process.env.TO_EMAIL);

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const config = process.env.GITHUB_ACTIONS ? getConfig() : BASE_CONFIG;

  // Get base data
  const pull = await octokit.request(PULL_BASE, config);
  const { title, merged_at, changed_files, merged_by, body } = pull.data;

  // Get reviewer info
  const reviews = await octokit.request(REVIEW_BASE, config);
  const approved = reviews.data.reduce((rdx, review) => {
    if (review.state === 'APPROVED') {
      rdx.push(review.user.login);
    }
    return rdx;
  }, []);

  // Formatting cleanup
  const date = getDate(merged_at);

  const md = new MarkdownIt();
  const content = md.render(body);

  const approvers = approved.join(', ');

  if (merged_by) {
    // Send the mail
    sendMail(title, date, content, approvers, merged_by.login, changed_files);
  } else {
    console.log(title, date, content, approvers, changed_files);
    console.log('PR has not been merged');
  }
}
run();