import Pheme, { ITask, modifyTask, createTask } from './index';

import TestRegistry from './test/registry';
import TestStorage from './test/storage';

describe('modifyTask', () => {
  it('should override the task', async () => {
    const taskBuilder = (): ITask => {
      return createTask({
        estimate: async () => 0,
        execute: (context) => {
          context.status = 'DONE';
          return Promise.resolve();
        }
      }, { status: 'READY' })
    };

    const baseTask = taskBuilder();
    expect(baseTask.context.status).toBe('READY');
    expect(await baseTask.execute()).toBeUndefined();
    expect(baseTask.context.status).toBe('DONE');

    const taskToBeModified = taskBuilder();
    const modifiedTask = modifyTask(taskToBeModified, {
      execute: () => taskToBeModified.execute().then(() => 'HELLO WORLD')
    });

    expect(modifiedTask.context.status).toBe('READY');
    expect(await modifiedTask.execute()).toBe('HELLO WORLD');
    expect(modifiedTask.context.status).toBe('DONE');
  });
});

describe('Core', () => {
  let core: Pheme<TestRegistry>;

  beforeEach(() => {
    core = new Pheme(new TestRegistry(), {
      test: new TestStorage()
    });
  });

  describe('constructor', () => {
    it('should be able to initialize', () => {
      expect(core).toBeTruthy();
    });

    it('should not initialize if no constructor is passed', () => {
      expect(() => new Pheme(undefined)).toThrowError('Cannot initialize without a valid registry supplied.');
    });
  });

  describe('registerHandle', () => {
    it('should register the supplied handle', async () => {
      expect(await core.registry.records.test).toBeUndefined();
      expect(await core.registerHandle('test').execute()).toBeUndefined();
      expect(await core.registry.records.test).toBeDefined();
    });
  });

  describe('getHandleProfile & updateHandleProfile', () => {
    beforeEach(() => core.registerHandle('test').execute());

    it('should update the handle profile', async () => {
      expect(await core.updateHandleProfile('test', { bio: 'Hello World' }).execute());
    });

    it('should get the handle profile', async () => {
      await core.updateHandleProfile('test', { bio: 'Hello World' }).execute();
      expect(await core.getHandleProfile('test').execute()).toEqual({ bio: 'Hello World' });
    });
  });

  describe('pushToHandle', () => {
    beforeEach(() => core.registerHandle('test').execute());

    it('should push content to the supplied handle', async () => {
      await core.pushToHandle('test', Buffer.from('CONTENT 1'), { title: 'CONTENT 1' }).execute();
      await core.pushToHandle('test', Buffer.from('CONTENT 2'), { title: 'CONTENT 2' }).execute();
      await core.pushToHandle('test', Buffer.from('CONTENT 3'), { title: 'CONTENT 3' }).execute();

      const [address, chain] = await core.loadHandle('test').execute();
      expect(address).toBeDefined();
      expect(chain.length).toBe(3);

      chain.forEach((ring, i) => {
        expect(ring.address).toBeDefined();
        expect(ring.uuid).toBeDefined();
        expect(ring.timestamp).toBeDefined();
        expect(ring.meta.title).toBe(`CONTENT ${chain.length - i}`);
      });
    });

    it('should pass a blank meta object if not provided', async () => {
      await core.pushToHandle('test', Buffer.from('CONTENT')).execute();
      const [address, chain] = await core.loadHandle('test').execute();
      expect(chain[0].meta).toEqual({});
    })
  });

  describe('replaceFromHandle', () => {
    beforeEach(async () => {
      await core.registerHandle('test').execute();

      await core.pushToHandle('test', Buffer.from('CONTENT 1'), { title: 'CONTENT 1' }).execute();
      await core.pushToHandle('test', Buffer.from('CONTENT 2'), { title: 'CONTENT 2' }).execute();
      await core.pushToHandle('test', Buffer.from('CONTENT 3'), { title: 'CONTENT 3' }).execute();
    });

    it('should replace the block contents of the block with the supplied uuid', async () => {
      const [oldAddress, oldChain] = await core.loadHandle('test').execute();
      const blockToReplace = oldChain[1];

      const oldContent = await core.storage.readData(blockToReplace.address);
      expect(oldContent.toString()).toBe('CONTENT 2');


      const newContent = 'CONTENT 2 (MODIFIED)';

      const [newAddress, newChain] = await core
        .replaceFromHandle('test', blockToReplace.uuid, Buffer.from(newContent), {
          title: newContent
        }).execute();

      expect(newChain).toHaveLength(3);
      expect(newAddress).not.toBe(oldAddress);
      const newBlock = newChain[1];
      expect(newBlock.meta.title).toBe(newContent);
      expect((await core.storage.readData(newBlock.address)).toString()).toBe(newContent);
    });
  });

  describe('removeFromHandle', () => {
    describe('with single content', () => {
      beforeEach(async () => {
        await core.registerHandle('test').execute();

        await core.pushToHandle('test', Buffer.from('CONTENT 1'), { title: 'CONTENT 1' }).execute();
      });

      it('should remove the content with the supplied uuid for the supplied handle', async () => {
        const [oldAddress, oldChain] = await core.loadHandle('test').execute();
        await core.removeFromHandle('test', oldChain[0].uuid).execute();

        const [address, chain] = await core.loadHandle('test').execute();
        expect(chain.length).toBe(0);
        expect(chain.map(block => block.meta.title)).toEqual([]);
        expect(address).toBeUndefined();
      });
    });

    describe('with multiple content', () => {
      beforeEach(async () => {
        await core.registerHandle('test').execute();

        await core.pushToHandle('test', Buffer.from('CONTENT 1'), { title: 'CONTENT 1' }).execute();
        await core.pushToHandle('test', Buffer.from('CONTENT 2'), { title: 'CONTENT 2' }).execute();
        await core.pushToHandle('test', Buffer.from('CONTENT 3'), { title: 'CONTENT 3' }).execute();
      });

      it('should remove the content with the supplied uuid for the supplied handle', async () => {
        const [oldAddress, oldChain] = await core.loadHandle('test').execute();
        await core.removeFromHandle('test', oldChain[1].uuid).execute();

        const [address, chain] = await core.loadHandle('test').execute();
        expect(chain.length).toBe(2);
        expect(chain.map(block => block.meta.title)).toEqual(['CONTENT 3', 'CONTENT 1']);
        expect(address).not.toEqual(oldAddress);
      });

      it('should not remove any content when an invalid uuid is passed', async () => {
        const [oldAddress, oldChain] = await core.loadHandle('test').execute();

        expect(core.removeFromHandle('test', 'XXXXXX').execute())
          .rejects.toThrow('test handle does not need modification');

        const [address, chain] = await core.loadHandle('test').execute();
        expect(chain.length).toBe(3);
        expect(chain.map(block => block.meta.title)).toEqual(['CONTENT 3', 'CONTENT 2', 'CONTENT 1']);
        expect(address).toEqual(oldAddress);
      });
    })
  });

  describe('loadHandle', () => {
    beforeEach(() => core.registerHandle('test').execute());

    it('should load the handle for an empty chain', async () => {
      const [address, blocks] = await core.loadHandle('test').execute();
      expect(address).toBeUndefined();
      expect(blocks).toEqual([]);
    });

    it('should load the handle for a loaded chain', async () => {
      const handle = await core.pushToHandle('test', Buffer.from('HELLO WORLD'), { title: 'HELLO WORLD' }).execute();
      const [address, blocks] = await core.loadHandle('test').execute();
      expect(address).toBe(handle[0]);
      expect(blocks).toEqual([handle[1]]);
    });
  });

  describe('storage handling', () => {
    it('should be able to storeData and fetchData', async () => {
      const data = 'HELLO WORLD';
      const address = await core.storage.writeData(Buffer.from(data));
      expect((await core.storage.readData(address)).toString()).toEqual(data);
    });

    it('should fail if an unknown storage is supplied as the preferred protocol', async () => {
      const address = 'bzzzt://broken-link';
      expect(() => core.storage.readData(address)).toThrowError('Unknown storage protocol');
    });
  });
});