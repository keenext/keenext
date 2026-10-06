import expect from 'expect.js';
import { KdbxEntry, KdbxTimes, KdbxUuid, ProtectedValue } from '../../lib';
import type { KdbxEntryField } from '../../lib';
import { copyProblems } from '../test-support/normalize';

describe('KdbxEntry', () => {
    function populatedEntry(): KdbxEntry {
        const entry = new KdbxEntry();
        entry.uuid = KdbxUuid.random();
        entry.icon = 5;
        entry.customIcon = KdbxUuid.random();
        entry.fgColor = '#ff0000';
        entry.bgColor = '#00ff00';
        entry.overrideUrl = 'cmd://{URL}';
        entry.tags = ['t1', 't2'];
        entry.times = KdbxTimes.create();
        entry.fields = new Map<string, KdbxEntryField>([
            ['Title', 'title'],
            ['Password', ProtectedValue.fromString('secret')]
        ]);
        entry.binaries = new Map([
            ['plain', new Uint8Array([1]).buffer],
            ['protected', ProtectedValue.fromBinary(new Uint8Array([2]).buffer)],
            ['pooled', { hash: 'abcd', value: new Uint8Array([3]).buffer }]
        ]);
        entry.autoType = {
            enabled: false,
            obfuscation: 1,
            defaultSequence: '{USERNAME}{TAB}{PASSWORD}',
            items: [{ window: 'Login*', keystrokeSequence: '{PASSWORD}' }]
        };
        entry.previousParentGroup = KdbxUuid.random();
        entry.customData = new Map([
            ['KeePassXC-Browser Settings', { value: '{}', lastModified: new Date() }]
        ]);
        entry.qualityCheck = false;
        return entry;
    }

    describe('copyFrom', () => {
        it('copies every property but history, parent group and edit state', () => {
            const fresh = new KdbxEntry();
            // Declared fields are own properties (ES2022 class fields); the check relies on it.
            expect(Object.keys(fresh)).to.contain('qualityCheck');
            const source = populatedEntry();
            const copy = new KdbxEntry();
            copy.copyFrom(source);
            expect(
                copyProblems(fresh, source, copy, ['history', 'parentGroup', '_editState'])
            ).to.eql([]);
        });

        it('does not share mutable state with the source', () => {
            const source = populatedEntry();
            const copy = new KdbxEntry();
            copy.copyFrom(source);
            expect(copy.tags).not.to.be(source.tags);
            expect(copy.times).not.to.be(source.times);
            expect(copy.fields).not.to.be(source.fields);
            expect(copy.fields.get('Password')).not.to.be(source.fields.get('Password'));
            expect(copy.binaries).not.to.be(source.binaries);
            expect(copy.autoType).not.to.be(source.autoType);
            expect(copy.customData).not.to.be(source.customData);
            expect(copy.customData!.get('KeePassXC-Browser Settings')).not.to.be(
                source.customData!.get('KeePassXC-Browser Settings')
            );
        });
    });
});
