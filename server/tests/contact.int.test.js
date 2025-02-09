const request = require('supertest');
const nock = require('nock');
const { server } = require('../src/index');
const jwt = require('../src/lib/jwt');
const platforms = require('../tests/platformInfo.json');
const { UserModel } = require('../src/models/userModel');
// create test data
const userId = 'userId';
const unknownUserId = 'unknownUserId';
const contactId = 'contactId';
const unknownJwt = 'unknownJwt;'
const rcUserNumber = '+123456789';
const accessToken = 'accessToken';
const phoneNumber = '+17206789819';
const unknownPhoneNumber = '+17206789820';
const extensionNumber = '224';

beforeAll(async () => {
    for (const platform of platforms) {
        await UserModel.create({
            id: `${userId}-${platform.name}`,
            name: 'userName',
            hostname: platform.hostname,
            platform: platform.name,
            rcUserNumber,
            accessToken
        });
    }
});

// clear test data in db
afterAll(async () => {
    for (const platform of platforms) {
        await UserModel.destroy({
            where: {
                id: `${userId}-${platform.name}`
            }
        })
    }
});


describe('contact tests', () => {
    describe('get jwt validation', () => {
        test('bad jwt - 400', async () => {
            // Act
            const res = await request(server).get(`/contact?jwtToken=${unknownJwt}&phoneNumber=${phoneNumber}`)

            // Assert
            expect(res.status).toEqual(400);
        });
        test('no jwt - 400', async () => {
            // Act
            const res = await request(server).get(`/contact?phoneNumber=${phoneNumber}`)

            // Assert
            expect(res.status).toEqual(400);
            console.log(res);
            expect(res.error.text).toEqual('Please go to Settings and authorize CRM platform');
        });
    });
    describe('get contact', () => {
        test('cannot find user - unsuccessful', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: unknownUserId,
                    rcUserNumber,
                    platform: platform.name
                });

                // Act
                const res = await request(server).get(`/contact?jwtToken=${jwtToken}&&phoneNumber=${phoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.message).toEqual(`Cannot find user with id: ${unknownUserId}`);
                expect(res.body.successful).toEqual(false);
            }
        });
        test('unknown contact - unsuccessful', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: `${userId}-${platform.name}`,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformGetContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search?term=${unknownPhoneNumber.replace('+1', '')}&fields=phone&limit=1`)
                    .once()
                    .reply(200, {
                        data: {
                            items: []
                        }
                    });

                // Act
                const res = await request(server).get(`/contact?jwtToken=${jwtToken}&&phoneNumber=${unknownPhoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                expect(res.body.message).toEqual(`Cannot find contact for phone number: ${unknownPhoneNumber.replace('+', ' ')}. Please create a contact on CRM website with  17206789820.`);

                // Clean up
                platformGetContactScope.done();
            }
        });
        test('contact with just extension number - unsuccessful', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: `${userId}-${platform.name}`,
                    rcUserNumber,
                    platform: platform.name
                });

                // Act
                const res = await request(server).get(`/contact?jwtToken=${jwtToken}&&phoneNumber=${extensionNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(false);
                expect(res.body.message).toEqual(`Cannot find contact for phone number: ${extensionNumber}. Please create a contact on CRM website with 224.`);
            }
        });
        test('known contact - successful', async () => {
            for (const platform of platforms) {
                // Arrange
                const jwtToken = jwt.generateJwt({
                    id: `${userId}-${platform.name}`,
                    rcUserNumber,
                    platform: platform.name
                });
                const platformGetContactScope = nock(platform.domain)
                    .get(`${platform.contactPath}/search?term=${phoneNumber.replace('+1', '')}&fields=phone&limit=1`)
                    .once()
                    .reply(200, {
                        data: {
                            items: [
                                {
                                    item: {
                                        id: contactId,
                                        phones: [phoneNumber],
                                        organization: {
                                            name: 'testOrganization'
                                        }
                                    }
                                }
                            ]
                        }
                    });
                const platformGetDealScope = nock(platform.domain)
                    .get(`${platform.contactPath}/${contactId}/deals?status=open`)
                    .once()
                    .reply(200, {
                        data: [{
                            id: 'dealId',
                            title: 'dealTitle'
                        }]
                    });

                // Act
                const res = await request(server).get(`/contact?jwtToken=${jwtToken}&&phoneNumber=${phoneNumber}`);

                // Assert
                expect(res.status).toEqual(200);
                expect(res.body.successful).toEqual(true);

                // Clean up
                platformGetContactScope.done();
                platformGetDealScope.done();
            }
        });
    });
});