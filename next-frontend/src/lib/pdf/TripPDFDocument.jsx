import React from 'react';
import { Document, Page, View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import { buildTripPdfModel } from './tripPdfModel';

const green = '#047857';
const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', paddingTop: 64, paddingBottom: 60, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10.5, color: '#292d2a' },
  running: { position: 'absolute', top: 25, left: 48, right: 48, fontSize: 8, color: '#647069', borderBottomWidth: 0.5, borderBottomColor: '#dce2dd', paddingBottom: 7 },
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: '#647069' },
  brand: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: green, letterSpacing: 2, marginBottom: 16 },
  title: { fontSize: 28, fontFamily: 'Helvetica-Bold', lineHeight: 1.15, marginBottom: 10 },
  subtitle: { fontSize: 14, color: green, marginBottom: 14 },
  bases: { fontSize: 11, color: '#505c54', marginBottom: 7 },
  section: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 10 },
  overviewRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e1e6e2', paddingVertical: 10 },
  dayLabel: { color: green, fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 1, marginBottom: 6 },
  overviewLabel: { width: 58, color: green, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  overviewTitle: { flex: 1, fontSize: 11 },
  dayTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', lineHeight: 1.2, marginBottom: 7 },
  dayHeader: { marginTop: 12, marginBottom: 15 },
  base: { fontSize: 10, color: '#57665e' },
  stop: { borderTopWidth: 0.5, borderTopColor: '#dce2dd', paddingTop: 12, marginBottom: 18 },
  time: { color: green, fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  stopTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', lineHeight: 1.3, marginBottom: 4 },
  meta: { fontSize: 9, color: '#647069', marginBottom: 7 },
  note: { fontSize: 10.5, lineHeight: 1.55 },
  transfer: { fontSize: 9, color: green, marginBottom: 9 },
  caveat: { fontSize: 9, color: '#57665e', marginTop: 6 },
  source: { fontSize: 8, color: green, marginTop: 7, textDecoration: 'none' },
  bullet: { fontSize: 10, lineHeight: 1.55, marginBottom: 6 },
});

function Frame({ title }) {
  return <Text fixed style={styles.running}>Trailie · {title}</Text>;
}
function Footer() {
  return <View fixed style={styles.footer}>
    <Text>Generated with Trailie · TrailVerse</Text>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>;
}
function splitNote(note) {
  const sentence = note.split(/(?<=\.)\s+/)[0];
  const limit = sentence.length > 400 ? sentence.lastIndexOf(' ', 400) : sentence.length;
  const opening = note.slice(0, limit > 0 ? limit : 400);
  return [opening, note.slice(opening.length).trim()];
}
function StopStart({ stop }) {
  return <View style={{ ...styles.stop, marginBottom: 0 }} wrap={false}>
      {stop.transfer && <Text style={styles.transfer}>{stop.transfer}</Text>}
      {stop.time && <Text style={styles.time}>{stop.time}</Text>}
      <Text style={styles.stopTitle}>{stop.number}. {stop.name}</Text>
      {stop.timingReason && <Text style={styles.meta}>{stop.timingReason}</Text>}
      {stop.meta && <Text style={styles.meta}>{stop.meta}</Text>}
      {/* Keep the title and opening description together; long notes can flow. */}
      {stop.note && <Text style={styles.note} orphans={3} widows={3}>{splitNote(stop.note)[0]}</Text>}
  </View>;
}
function StopRest({ stop }) {
  return <View style={{ marginBottom: 18 }}>
    {splitNote(stop.note)[1] && <Text style={styles.note} orphans={3} widows={3}>{splitNote(stop.note)[1]}</Text>}
    {stop.caveats.map((note, i) => <Text key={i} style={styles.caveat}>{note}</Text>)}
    {stop.sourceUrl && <Link src={stop.sourceUrl} style={styles.source}>Place details and current information</Link>}
  </View>;
}
function Stop({ stop }) {
  return <View wrap={stop.note.length > 1400}><StopStart stop={stop} /><StopRest stop={stop} /></View>;
}
export function TripPDFDocument({ trip }) {
  const model = buildTripPdfModel(trip);
  return <Document title={`${model.destination} · ${model.duration}`} author="TrailVerse" creator="Trailie by TrailVerse" subject="Travel itinerary">
    <Page size="LETTER" style={styles.page}>
      <Frame title={model.destination} />
      <Text style={styles.brand}>TRAILIE / TRAILVERSE</Text>
      <Text style={styles.title}>{model.destination}</Text>
      <Text style={styles.subtitle}>{model.duration}</Text>
      {model.bases && <Text style={styles.bases}>{model.bases.replaceAll('→', ' / ')}</Text>}
      {model.schedule && <Text style={styles.bases}>{model.schedule}</Text>}
      <Text style={styles.section}>Your trip at a glance</Text>
      {model.days.map(day => <View key={day.number} style={styles.overviewRow} wrap={false}>
        <Text style={styles.overviewLabel}>DAY {day.number}</Text><Text style={styles.overviewTitle}>{day.title}</Text>
      </View>)}
      <View minPresenceAhead={100}>
        <Text style={styles.section}>Before you go</Text>
        {model.beforeYouGo.map(line => <Text key={line} style={styles.bullet}>• {line}</Text>)}
      </View>
      <Footer />
    </Page>
    {model.days.map(day => <Page key={day.number} size="LETTER" style={styles.page} wrap>
      <Frame title={`${model.destination} · Day ${day.number}`} />
      <View wrap={false}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayLabel}>DAY {day.number}{day.dayType ? ` · ${day.dayType}` : ''}{day.date ? ` · ${day.date}` : ''}</Text>
          <Text style={styles.dayTitle}>{day.title}</Text>
          {day.summary && <Text style={styles.note}>{day.summary}</Text>}
          {day.base && <Text style={styles.base}>Overnight base · {day.base}</Text>}
        </View>
        {!day.blocks.length && day.stops[0] && <StopStart stop={day.stops[0]} />}
      </View>
      {!day.blocks.length && day.stops[0] && <StopRest stop={day.stops[0]} />}
      {day.blocks.length ? day.blocks.map((block, i) => <React.Fragment key={i}>
        <View style={{ marginBottom: 12 }} wrap={false}>
          <Text style={styles.dayLabel}>{block.periods.join(' - ').toUpperCase()}</Text>
          {block.time && <Text style={styles.time}>{block.time}</Text>}
          <Text style={styles.stopTitle}>{block.label}</Text>
          <Text style={styles.note}>{block.note}</Text>
          {block.timingReason && <Text style={styles.meta}>{block.timingReason}</Text>}
        </View>
        {block.stopNumbers.map(n => <Stop key={n} stop={day.stops[n - 1]} />)}
      </React.Fragment>) : day.stops.slice(1).map(stop => <Stop key={stop.number} stop={stop} />)}
      {day.blocks.length ? day.stops.filter(stop => !day.blocks.some(block => block.stopNumbers.includes(stop.number))).map(stop => <Stop key={stop.number} stop={stop} />) : null}
      <Footer />
    </Page>)}
    {(model.packing.length > 0 || model.permits.length > 0) && <Page size="LETTER" style={styles.page} wrap>
      <Frame title={model.destination} />
      {[['Packing list', model.packing], ['Permits and reservations', model.permits]].filter(([, items]) => items.length).map(([title, items]) => <View key={title}>
        <Text style={styles.section} minPresenceAhead={50}>{title}</Text>
        {items.map((item, i) => <Text key={i} style={styles.bullet}>• {item}</Text>)}
      </View>)}
      <Footer />
    </Page>}

  </Document>;
}
export default TripPDFDocument;
