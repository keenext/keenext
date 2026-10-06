import expect from 'expect.js';
import {
    Kdbx,
    KdbxContext,
    KdbxCustomData,
    KdbxCustomDataItem,
    KdbxHeader,
    XmlUtils
} from '../../lib';

describe('KdbxCustomData', () => {
    const kdbx = new Kdbx();
    const ctx = new KdbxContext({ kdbx });

    it('reads custom data from xml', () => {
        const xml = XmlUtils.parse(
            '<CustomData>' +
                '<Item><Key>k1</Key><Value>v1</Value></Item>' +
                '<Item><Key>k2</Key><Value>v2</Value></Item>' +
                '</CustomData>'
        );
        const cd = KdbxCustomData.read(xml.documentElement);
        expect([...cd.entries()]).to.eql([
            ['k1', { value: 'v1' }],
            ['k2', { value: 'v2' }]
        ]);
    });

    it('reads empty custom data from empty xml', () => {
        const xml = XmlUtils.parse('<CustomData></CustomData>');
        const cd = KdbxCustomData.read(xml.documentElement);
        expect(cd).to.eql({});
    });

    it('skips unknown tags', () => {
        const xml = XmlUtils.parse(
            '<CustomData><Item><Key>k</Key><Value>v</Value><x></x></Item><Something></Something></CustomData>'
        );
        const cd = KdbxCustomData.read(xml.documentElement);
        expect([...cd.entries()]).to.eql([['k', { value: 'v' }]]);
    });

    it('skips empty keys', () => {
        const xml = XmlUtils.parse(
            '<CustomData><Item><Key></Key><Value>v</Value></Item></CustomData>'
        );
        const cd = KdbxCustomData.read(xml.documentElement);
        expect(cd).to.eql({});
    });

    it('writes custom data to xml', () => {
        const xml = XmlUtils.create('root');
        KdbxCustomData.write(
            xml.documentElement,
            ctx,
            new Map([
                ['k1', { value: 'v1' }],
                ['k2', { value: 'v2' }]
            ])
        );
        expect(XmlUtils.serialize(<Document>(<unknown>xml.documentElement))).to.eql(
            '<root><CustomData>' +
                '<Item><Key>k1</Key><Value>v1</Value></Item>' +
                '<Item><Key>k2</Key><Value>v2</Value></Item>' +
                '</CustomData></root>'
        );
    });

    it('writes empty custom data to xml', () => {
        const xml = XmlUtils.create('root');
        KdbxCustomData.write(xml.documentElement, ctx, new Map());
        expect(
            XmlUtils.serialize(<Document>(<unknown>xml.documentElement)).replace(/\s/g, '')
        ).to.eql('<root><CustomData/></root>');
    });

    it('does not create tag for empty custom data', () => {
        const xml = XmlUtils.create('root');
        KdbxCustomData.write(xml.documentElement, ctx, undefined);
        expect(
            XmlUtils.serialize(<Document>(<unknown>xml.documentElement)).replace(/\s/g, '')
        ).to.eql('<root/>');
    });

    it('writes modification time in binary for KDBX 4.1 and as text for XML export', () => {
        const kdbx41 = new Kdbx();
        kdbx41.header = KdbxHeader.create();
        kdbx41.header.versionMinor = 1;
        const customData = new Map<string, KdbxCustomDataItem>([
            ['k', { value: 'v', lastModified: new Date('2021-01-20T18:10:44Z') }]
        ]);
        const written = (exportXml: boolean) => {
            const xml = XmlUtils.create('root');
            KdbxCustomData.write(
                xml.documentElement,
                new KdbxContext({ kdbx: kdbx41, exportXml }),
                customData
            );
            return XmlUtils.serialize(<Document>(<unknown>xml.documentElement));
        };
        expect(written(false)).to.contain(
            '<LastModificationTime>JGma1w4AAAA=</LastModificationTime>'
        );
        expect(written(true)).to.contain(
            '<LastModificationTime>2021-01-20T18:10:44Z</LastModificationTime>'
        );
    });

    it('skips keys without values', () => {
        const xml = XmlUtils.create('root');
        KdbxCustomData.write(
            xml.documentElement,
            ctx,
            new Map<string, KdbxCustomDataItem>([
                ['k1', { value: 'v1' }],
                ['k2', { value: '' }],
                ['k3', { value: undefined }]
            ])
        );
        expect(XmlUtils.serialize(<Document>(<unknown>xml.documentElement))).to.eql(
            '<root><CustomData>' +
                '<Item><Key>k1</Key><Value>v1</Value></Item>' +
                '</CustomData></root>'
        );
    });
});
