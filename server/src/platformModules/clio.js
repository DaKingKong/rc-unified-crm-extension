const axios = require('axios');
const { UserModel } = require('../models/userModel');
const Op = require('sequelize').Op;
const moment = require('moment');
const url = require('url');

function getAuthType() {
    return 'oauth';
}

function getOauthInfo() {
    return {
        clientId: process.env.CLIO_CLIENT_ID,
        clientSecret: process.env.CLIO_CLIENT_SECRET,
        accessTokenUri: process.env.CLIO_ACCESS_TOKEN_URI,
        redirectUri: process.env.CLIO_REDIRECT_URI
    }
}

async function getUserInfo({ authHeader }) {
    const userInfoResponse = await axios.get('https://app.clio.com/api/v4/users/who_am_i.json?fields=id,name,time_zone', {
        headers: {
            'Authorization': authHeader
        }
    });
    return {
        id: userInfoResponse.data.data.id.toString(),
        name: userInfoResponse.data.data.name,
        timezoneName: userInfoResponse.data.data.time_zone,
        timezoneOffset: 0,  //TODO: find timezone offset from timezone name/code
        additionalInfo: {
        }
    };
}

async function saveUserOAuthInfo({ id, name, hostname, accessToken, refreshToken, tokenExpiry, rcUserNumber, timezoneName, timezoneOffset, additionalInfo }) {
    const existingUser = await UserModel.findOne({
        where: {
            [Op.and]: [
                {
                    id,
                    platform: 'clio'
                }
            ]
        }
    });
    if (existingUser) {
        await existingUser.update(
            {
                name,
                hostname,
                timezoneName,
                timezoneOffset,
                accessToken,
                refreshToken,
                tokenExpiry,
                rcUserNumber,
                platformAdditionalInfo: additionalInfo
            }
        );
    }
    else {
        await UserModel.create({
            id,
            name,
            hostname,
            timezoneName,
            timezoneOffset,
            platform: 'clio',
            accessToken,
            refreshToken,
            tokenExpiry,
            rcUserNumber,
            platformAdditionalInfo: additionalInfo
        });
    }
}


async function unAuthorize({ id }) {
    const user = await UserModel.findOne(
        {
            where: {
                id,
                platform: 'clio'
            }
        });
    const revokeUrl = 'https://app.clio.com/oauth/deauthorize';
    const accessTokenParams = new url.URLSearchParams({
        token: user.accessToken
    });
    const accessTokenRevokeRes = await axios.post(
        revokeUrl,
        accessTokenParams,
        {
            headers: { 'Authorization': `Bearer ${user.accessToken}` }
        });
    await user.destroy();
}

async function addCallLog({ user, contactInfo, authHeader, callLog, note, additionalSubmission, timezoneOffset }) {
    const postBody = {
        data: {
            subject: `[Call] ${callLog.direction} Call ${callLog.direction === 'Outbound' ? 'to' : 'from'} ${contactInfo.name}`,
            body: `Duration: ${callLog.duration} secs\nCall Result: ${callLog.result}\nNote: ${note}${callLog.recording ? `\n[Call recording link] ${callLog.recording.link}` : ''} \n\n--- Added by RingCentral CRM Extension`,
            type: 'PhoneCommunication',
            received_at: moment(callLog.startTime).toISOString(),
            senders: [
                {
                    id: contactInfo.id,
                    type: 'Contact'
                }
            ],
            receivers: [
                {
                    id: user.id,
                    type: 'User'
                }
            ],
            notification_event_subscribers: [
                {
                    user_id: user.id
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matterId) {
        postBody.data['matter'] = { id: additionalSubmission.matterId };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function addMessageLog({ user, contactInfo, authHeader, message, additionalSubmission, recordingLink, timezoneOffset }) {
    const postBody = {
        data: {
            subject: `[SMS] ${message.direction} SMS - ${message.from.name ?? ''}(${message.from.phoneNumber}) to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`,
            body: `${message.direction} SMS - ${message.direction == 'Inbound' ? `from ${message.from.name ?? ''}(${message.from.phoneNumber})` : `to ${message.to[0].name ?? ''}(${message.to[0].phoneNumber})`} \n${!!message.subject ? `[Message] ${message.subject}` : ''} ${!!recordingLink ? `\n[Recording link] ${recordingLink}` : ''}\n\n--- Added by RingCentral CRM Extension`,
            type: 'PhoneCommunication',
            received_at: moment(message.creationTime).toISOString(),
            senders: [
                {
                    id: contactInfo.id,
                    type: 'Contact'
                }
            ],
            receivers: [
                {
                    id: user.id,
                    type: 'User'
                }
            ],
            notification_event_subscribers: [
                {
                    user_id: user.id
                }
            ]
        }
    }
    if (additionalSubmission && additionalSubmission.matterId) {
        postBody.data['matter'] = { id: additionalSubmission.matterId };
    }
    const addLogRes = await axios.post(
        `https://${user.hostname}/api/v4/communications.json`,
        postBody,
        {
            headers: { 'Authorization': authHeader }
        });
    return addLogRes.data.data.id;
}

async function getContact({ user, authHeader, phoneNumber }) {
    const personInfo = await axios.get(
        `https://${user.hostname}/api/v4/contacts.json?type=Person&query=${phoneNumber}&fields=id,name,title,company`,
        {
            headers: { 'Authorization': authHeader }
        });
    if (personInfo.data.data.length === 0) {
        return null;
    }
    else {
        let result = personInfo.data.data[0];
        const matterInfo = await axios.get(
            `https://${user.hostname}/api/v4/matters.json?client_id=${result.id}`,
            {
                headers: { 'Authorization': authHeader }
            });
        const matters = matterInfo.data.data.map(m => { return { id: m.id, title: m.display_number } });
        return {
            id: result.id,
            name: result.name,
            title: result.title,
            company: result.company.name,
            phone: phoneNumber,
            matters
        }
    }
}


exports.getAuthType = getAuthType;
exports.getOauthInfo = getOauthInfo;
exports.saveUserOAuthInfo = saveUserOAuthInfo;
exports.getUserInfo = getUserInfo;
exports.addCallLog = addCallLog;
exports.addMessageLog = addMessageLog;
exports.getContact = getContact;
exports.unAuthorize = unAuthorize;