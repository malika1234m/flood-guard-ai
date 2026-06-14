import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { Colors, Fonts, Glass, Radius, Spacing } from '@/constants/theme';

interface FieldWrapProps {
  label: string;
  helperText?: string;
  children: React.ReactNode;
}

function FieldWrap({ label, helperText, children }: FieldWrapProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  keyboardType?: KeyboardTypeOptions;
  icon?: keyof typeof Feather.glyphMap;
}

export function TextField({ label, value, onChangeText, placeholder, helperText, keyboardType, icon }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <FieldWrap label={label} helperText={helperText}>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        {icon && <Feather name={icon} size={16} color={focused ? Colors.brand : Colors.textMuted} style={styles.inputIcon} />}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType ?? 'default'}
          selectionColor={Colors.brand}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </FieldWrap>
  );
}

export function NumberField(props: Omit<TextFieldProps, 'keyboardType'>) {
  return <TextField {...props} keyboardType="numeric" />;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  helperText?: string;
  icon?: keyof typeof Feather.glyphMap;
}

export function SelectField({ label, value, options, onChange, helperText, icon }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <FieldWrap label={label} helperText={helperText}>
      <Pressable
        style={[styles.inputWrap, styles.selectInput]}
        onPress={() => setOpen(true)}
        disabled={options.length === 0}
      >
        {icon && <Feather name={icon} size={16} color={Colors.textMuted} style={styles.inputIcon} />}
        <Text style={[styles.selectText, !value && styles.placeholder]} numberOfLines={1}>
          {value || 'Select…'}
        </Text>
        <Feather name="chevron-down" size={18} color={Colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <View style={styles.sheet}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, styles.sheetTint]} />
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{label}</Text>
              {options.length > 7 && (
                <View style={styles.searchWrap}>
                  <Feather name="search" size={15} color={Colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search…"
                    placeholderTextColor={Colors.textMuted}
                    selectionColor={Colors.brand}
                    autoFocus
                  />
                </View>
              )}
              <FlatList
                data={filtered}
                keyExtractor={(item) => item}
                style={styles.sheetList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.emptyText}>No matches found.</Text>}
                renderItem={({ item }) => {
                  const active = item === value;
                  return (
                    <Pressable
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => {
                        onChange(item);
                        close();
                      }}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>
                        {item}
                      </Text>
                      {active && <Feather name="check" size={16} color={Colors.brand} />}
                    </Pressable>
                  );
                }}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </FieldWrap>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: Spacing.three,
  },
  label: {
    color: Colors.text,
    fontFamily: Fonts.semibold,
    fontSize: 13.5,
    marginBottom: Spacing.two,
    letterSpacing: 0.1,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.panel2,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
  },
  inputWrapFocused: {
    borderColor: Colors.brand,
    backgroundColor: 'rgba(56,189,248,0.06)',
    shadowColor: Colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  inputIcon: {
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.medium,
    fontSize: 15,
    paddingVertical: Spacing.two + 4,
  },
  helper: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: Spacing.one + 2,
    lineHeight: 17,
  },
  selectInput: {
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 4,
  },
  selectText: {
    color: Colors.text,
    fontFamily: Fonts.medium,
    fontSize: 15,
    flex: 1,
  },
  placeholder: {
    color: Colors.textMuted,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,18,0.65)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Glass.border,
    overflow: 'hidden',
    maxHeight: '72%',
  },
  sheetTint: {
    backgroundColor: 'rgba(11,19,32,0.55)',
  },
  sheetContent: {
    padding: Spacing.three + 2,
    gap: Spacing.two + 2,
  },
  sheetTitle: {
    color: Colors.text,
    fontFamily: Fonts.extrabold,
    fontSize: 16,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: Fonts.medium,
    fontSize: 14.5,
    paddingVertical: Spacing.two + 2,
  },
  sheetList: {
    flexGrow: 1,
    flexShrink: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.sm,
  },
  optionActive: {
    backgroundColor: 'rgba(56,189,248,0.10)',
  },
  optionText: {
    color: Colors.text,
    fontFamily: Fonts.medium,
    fontSize: 15,
    flex: 1,
  },
  optionTextActive: {
    color: Colors.brand,
    fontFamily: Fonts.bold,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
});
