const React = require('react');

const mockIcon = (name) => {
  const Icon = ({ size, color, ...props }) => (
    React.createElement('svg', {
      'data-testid': `icon-${name}`,
      width: size,
      height: size,
      stroke: color,
      ...props,
    })
  );
  Icon.displayName = name;
  return Icon;
};

module.exports = {
  Home: mockIcon('Home'),
  Users: mockIcon('Users'),
  Building2: mockIcon('Building2'),
  CalendarClock: mockIcon('CalendarClock'),
  Handshake: mockIcon('Handshake'),
  Inbox: mockIcon('Inbox'),
  FileText: mockIcon('FileText'),
  BarChart3: mockIcon('BarChart3'),
  Bell: mockIcon('Bell'),
  Settings: mockIcon('Settings'),
  Search: mockIcon('Search'),
  Phone: mockIcon('Phone'),
  MapPin: mockIcon('MapPin'),
  Clock: mockIcon('Clock'),
  ChevronLeft: mockIcon('ChevronLeft'),
  Target: mockIcon('Target'),
  X: mockIcon('X'),
  Archive: mockIcon('Archive'),
  Plus: mockIcon('Plus'),
  Mail: mockIcon('Mail'),
};
