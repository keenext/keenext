import expect from 'expect.js';
import { KdbxGroup, KdbxTimes, KdbxUuid } from '../../lib';
import { copyProblems } from '../test-support/normalize';

describe('KdbxGroup', () => {
    function populatedGroup(): KdbxGroup {
        const group = new KdbxGroup();
        group.uuid = KdbxUuid.random();
        group.name = 'name';
        group.notes = 'notes';
        group.icon = 48;
        group.customIcon = KdbxUuid.random();
        group.tags = ['t1', 't2'];
        group.times = KdbxTimes.create();
        group.expanded = false;
        group.defaultAutoTypeSeq = '{PASSWORD}';
        group.enableAutoType = false;
        group.enableSearching = false;
        group.lastTopVisibleEntry = KdbxUuid.random();
        group.previousParentGroup = KdbxUuid.random();
        group.customData = new Map([['key', { value: 'value', lastModified: new Date() }]]);
        return group;
    }

    describe('copyFrom', () => {
        it('copies every property but child groups, entries and parent group', () => {
            const fresh = new KdbxGroup();
            // Declared fields are own properties (ES2022 class fields); the check relies on it.
            expect(Object.keys(fresh)).to.contain('customData');
            const source = populatedGroup();
            const copy = new KdbxGroup();
            copy.copyFrom(source);
            expect(copyProblems(fresh, source, copy, ['groups', 'entries', 'parentGroup'])).to.eql(
                []
            );
        });

        it('does not share mutable state with the source', () => {
            const source = populatedGroup();
            const copy = new KdbxGroup();
            copy.copyFrom(source);
            expect(copy.tags).not.to.be(source.tags);
            expect(copy.times).not.to.be(source.times);
            expect(copy.customData).not.to.be(source.customData);
            expect(copy.customData!.get('key')).not.to.be(source.customData!.get('key'));
        });
    });
});
