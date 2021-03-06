'use strict';

const debug = require('debug')('joystream:substrate:assets');

const { Null, U64 } = require('@polkadot/types/primitive');

const { _ } = require('lodash');

const { RolesApi } = require('joystream/substrate/roles');

/*
 * Add role related functionality to the substrate API.
 */
class AssetApi extends RolesApi
{
  static async create(account_file)
  {
    const ret = new AssetApi();
    await ret.init(account_file);
    return ret;
  }

  async init(account_file)
  {
    debug('Init');

    // Super init
    await super.init(account_file);
  }

  /*
   * Return the Data Object for a CID
   */
  async getDataObject(contentId)
  {
    const obj = await this.api.query.dataDirectory.dataObjectByContentId(contentId);
    return obj;
  }

  /*
   * Verify the liaison state for a DO:
   * - Check the content ID has a DO
   * - Check the account is the liaison
   * - Check the liaison state is pending
   *
   * Each failure errors out, success returns the data object.
   */
  async checkLiaisonForDataObject(accountId, contentId)
  {
    const obj = await this.getDataObject(contentId);
    if (_.isEqual(obj.raw, new Null())) {
      throw new Error(`No DataObject created for content ID: ${contentId}`);
    }

    const encode = require('@polkadot/keyring/address/encode').default;
    const encoded = encode(obj.raw.liaison);
    if (encoded != accountId) {
      throw new Error(`This storage node is not liaison for the content ID: ${contentId}`);
    }

    if (_.isEqual(obj.raw.liaison_judgement, new Null())) {
      throw new Error('Internal error; liaison_judgement should always be set!');
    }

    const judge_val = obj.raw.liaison_judgement.raw;
    const judge_arr = obj.raw.liaison_judgement._enum;

    if (judge_arr[judge_val] != 'Pending') {
      throw new Error(`Expected Pending judgement, but found: ${judge_arr[judge_val]}`);
    }

    return obj;
  }

  /*
   * Changes a data object liaison judgement.
   */
  async acceptContent(accountId, contentId)
  {
    const tx = this.api.tx.dataDirectory.acceptContent(contentId);
    return await this.signAndSendWithRetry(accountId, tx);
  }

  /*
   * Changes a data object liaison judgement.
   */
  async rejectContent(accountId, contentId)
  {
    const tx = this.api.tx.dataDirectory.rejectContent(contentId);
    return await this.signAndSendWithRetry(accountId, tx);
  }

  /*
   * Create storage relationship
   */
  async createStorageRelationship(accountId, contentId, callback)
  {
    const tx = this.api.tx.dataObjectStorageRegistry.addRelationship(contentId);

    const subscribed = [['dataObjectStorageRegistry', 'DataObjectStorageRelationshipAdded']];
    return await this.signAndSendWithRetry(accountId, tx, 3, subscribed, callback);
  }

  async createAndReturnStorageRelationship(accountId, contentId)
  {
    return new Promise(async (resolve, reject) => {
      try {
        await this.createStorageRelationship(accountId, contentId, (events) => {
          events.forEach((event) => {
            resolve(event[1].DataObjectStorageRelationshipId);
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /*
   * Toggle ready state for DOSR.
   */
  async toggleStorageRelationshipReady(accountId, dosrId, ready)
  {
    var tx = ready
      ? this.api.tx.dataObjectStorageRegistry.setRelationshipReady(dosrId)
      : this.api.tx.dataObjectStorageRegistry.unsetRelationshipReady(dosrId);
    return await this.signAndSendWithRetry(accountId, tx);
  }
}

module.exports = {
  AssetApi: AssetApi,
}
