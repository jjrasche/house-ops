import { type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  FlatList,
  Switch,
  Modal,
  StyleSheet,
} from "react-native";
import type { ComponentRegistry, ComponentRenderer } from "auxi/sdui";
import { colors, fontSize, spacing, radius } from "../lib/theme";

// --- Layout primitives ---

const ColumnRenderer: ComponentRenderer = (props, children) => {
  const style = buildLayoutStyle(props, "column");
  return <View style={style} key={props.key as string}>{children}</View>;
};

const RowRenderer: ComponentRenderer = (props, children) => {
  const style = buildLayoutStyle(props, "row");
  return <View style={style} key={props.key as string}>{children}</View>;
};

const StackRenderer: ComponentRenderer = (props, children) => (
  <View style={styles.stack} key={props.key as string}>{children}</View>
);

const ScrollViewRenderer: ComponentRenderer = (props, children) => (
  <ScrollView
    horizontal={props.horizontal as boolean}
    style={styles.scrollView}
    key={props.key as string}
  >
    {children}
  </ScrollView>
);

const GridRenderer: ComponentRenderer = (props, children) => {
  const columns = (props.columns as number) ?? 2;
  const gap = (props.gap as number) ?? spacing.sm;
  const cellBasis = `${100 / columns}%` as `${number}%`;
  return (
    <View style={[styles.grid, { gap }]} key={props.key as string}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <View key={i} style={{ flexBasis: cellBasis, flexGrow: 0, flexShrink: 0 }}>
              {child}
            </View>
          ))
        : children}
    </View>
  );
};

// --- Content primitives ---

const TextRenderer: ComponentRenderer = (props) => {
  const variant = props.variant as string | undefined;
  const textStyle = variant ? variantStyles[variant] ?? styles.bodyText : styles.bodyText;
  const alignStyle = props.align ? { textAlign: props.align as "left" | "center" | "right" } : undefined;
  const colorStyle = props.color ? { color: props.color as string } : undefined;
  const boldStyle = props.bold ? { fontWeight: "700" as const } : undefined;

  return (
    <Text
      style={[textStyle, alignStyle, colorStyle, boldStyle]}
      numberOfLines={props.numberOfLines as number | undefined}
      key={props.key as string}
    >
      {props.value as string}
    </Text>
  );
};

const ImageRenderer: ComponentRenderer = (props) => (
  <Image
    source={{ uri: props.source as string }}
    accessibilityLabel={props.alt as string}
    resizeMode={(props.fit as "cover" | "contain" | "stretch") ?? "cover"}
    style={[styles.image, props.aspectRatio ? { aspectRatio: props.aspectRatio as number } : undefined]}
    key={props.key as string}
  />
);

const IconRenderer: ComponentRenderer = (props) => (
  <Text
    style={{
      fontSize: (props.size as number) ?? 24,
      color: (props.color as string) ?? colors.foreground,
    }}
    key={props.key as string}
  >
    {props.name as string}
  </Text>
);

const DividerRenderer: ComponentRenderer = (props) => {
  const isVertical = props.orientation === "vertical";
  return (
    <View
      style={isVertical ? styles.dividerVertical : styles.dividerHorizontal}
      key={props.key as string}
    />
  );
};

const SpacerRenderer: ComponentRenderer = (props) => {
  const size = props.size as number | undefined;
  const flex = props.flex as number | undefined;
  return (
    <View
      style={[size ? { height: size, width: size } : undefined, flex ? { flex } : undefined]}
      key={props.key as string}
    />
  );
};

// --- Input primitives ---

const TextInputRenderer: ComponentRenderer = (props) => (
  <TextInput
    placeholder={props.placeholder as string | undefined}
    multiline={props.multiline as boolean | undefined}
    maxLength={props.maxLength as number | undefined}
    onSubmitEditing={props.onAction as (() => void) | undefined}
    style={styles.textInput}
    placeholderTextColor={colors.mutedForeground}
    key={props.key as string}
  />
);

const ButtonRenderer: ComponentRenderer = (props) => {
  const variant = (props.variant as string) ?? "primary";
  const buttonStyle = buttonVariantStyles[variant] ?? buttonVariantStyles.primary;

  return (
    <Pressable
      onPress={props.onAction as (() => void) | undefined}
      disabled={Boolean(props.disabled)}
      style={[styles.buttonBase, buttonStyle.container, Boolean(props.disabled) && styles.disabled]}
      key={props.key as string}
    >
      <Text style={[styles.buttonText, buttonStyle.text]}>{props.label as string}</Text>
    </Pressable>
  );
};

const ToggleRenderer: ComponentRenderer = (props) => (
  <View style={styles.toggleRow} key={props.key as string}>
    {props.label != null && <Text style={styles.bodyText}>{String(props.label)}</Text>}
    <Switch value={Boolean(props.value)} onValueChange={props.onAction as ((v: boolean) => void) | undefined} />
  </View>
);

const SelectRenderer: ComponentRenderer = (props) => {
  const options = (props.options as Array<{ label: string; value: string }>) ?? [];
  const selectedLabel = options.find((o) => o.value === props.selectedValue)?.label ?? (props.placeholder as string) ?? "Select...";

  return (
    <Pressable style={styles.selectTrigger} onPress={props.onAction as (() => void) | undefined} key={props.key as string}>
      <Text style={styles.selectText}>{selectedLabel}</Text>
      <Text style={styles.selectChevron}>▾</Text>
    </Pressable>
  );
};

const SliderRenderer: ComponentRenderer = (props) => (
  <View style={styles.sliderPlaceholder} key={props.key as string}>
    <Text style={styles.captionText}>
      Slider: {(props.min as number) ?? 0}–{(props.max as number) ?? 100}
    </Text>
  </View>
);

// --- Container primitives ---

const CardRenderer: ComponentRenderer = (props, children) => {
  const cardStyle = resolveCardStyle((props.variant as string) ?? "outlined");
  return <View style={[styles.cardBase, cardStyle]} key={props.key as string}>{children}</View>;
};

const ListRenderer: ComponentRenderer = (props) => {
  const data = (props.data as unknown[]) ?? [];
  const renderItem = props.renderItem as ((item: unknown, index: number) => ReactNode) | undefined;

  if (!renderItem) {
    return (
      <View key={props.key as string}>
        <Text style={styles.captionText}>{(props.emptyText as string) ?? "No items"}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      renderItem={({ item, index }) => <>{renderItem(item, index)}</>}
      keyExtractor={(_item, index) => String(index)}
      key={props.key as string}
    />
  );
};

const TabsRenderer: ComponentRenderer = (props, children) => {
  const items = (props.items as string[]) ?? [];
  const selectedIndex = (props.selectedIndex as number) ?? 0;

  return (
    <View key={props.key as string}>
      <ScrollView horizontal style={styles.tabBar}>
        {items.map((label, i) => (
          <Pressable key={label} style={[styles.tab, i === selectedIndex && styles.tabSelected]}>
            <Text style={[styles.tabText, i === selectedIndex && styles.tabTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {children}
    </View>
  );
};

const ModalRenderer: ComponentRenderer = (props, children) => (
  <Modal transparent animationType="fade" key={props.key as string}>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        {props.title != null && <Text style={styles.headingText}>{String(props.title)}</Text>}
        {children}
      </View>
    </View>
  </Modal>
);

const ChipRenderer: ComponentRenderer = (props) => {
  const selected = Boolean(props.selected);
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={props.onAction as (() => void) | undefined}
      key={props.key as string}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {props.label as string}
      </Text>
    </Pressable>
  );
};

// --- Registry ---

export const componentRegistry: ComponentRegistry = {
  column: ColumnRenderer,
  row: RowRenderer,
  stack: StackRenderer,
  scrollview: ScrollViewRenderer,
  grid: GridRenderer,
  text: TextRenderer,
  image: ImageRenderer,
  icon: IconRenderer,
  divider: DividerRenderer,
  spacer: SpacerRenderer,
  textinput: TextInputRenderer,
  button: ButtonRenderer,
  toggle: ToggleRenderer,
  select: SelectRenderer,
  slider: SliderRenderer,
  card: CardRenderer,
  list: ListRenderer,
  tabs: TabsRenderer,
  modal: ModalRenderer,
  chip: ChipRenderer,
};

// --- Helpers ---

function buildLayoutStyle(
  props: Record<string, unknown>,
  direction: "column" | "row",
) {
  return {
    flexDirection: direction as "column" | "row",
    gap: (props.gap as number) ?? 0,
    padding: normalizePadding(props.padding),
    alignItems: mapAlign(props.align as string | undefined),
    justifyContent: mapJustify(props.justify as string | undefined),
    flex: props.flex as number | undefined,
  };
}

function resolveCardStyle(variant: string): object {
  if (variant === "elevated") return styles.cardElevated;
  if (variant === "filled") return styles.cardFilled;
  return styles.cardOutlined;
}

function normalizePadding(padding: unknown): number | undefined {
  if (typeof padding === "number") return padding;
  return undefined;
}

function mapAlign(align?: string) {
  const map: Record<string, "flex-start" | "center" | "flex-end" | "stretch"> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch",
  };
  return align ? map[align] : undefined;
}

function mapJustify(justify?: string) {
  const map: Record<string, "flex-start" | "center" | "flex-end" | "space-between" | "space-around"> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    between: "space-between",
    around: "space-around",
  };
  return justify ? map[justify] : undefined;
}

// --- Variant maps ---

const variantStyles: Record<string, object> = {
  heading: { fontSize: fontSize.lg, fontWeight: "700", color: colors.foreground },
  subheading: { fontSize: fontSize.base, fontWeight: "600", color: colors.foreground },
  body: { fontSize: fontSize.sm, color: colors.foreground },
  caption: { fontSize: fontSize.xs, color: colors.mutedForeground },
  label: { fontSize: fontSize.xs, fontWeight: "600", color: colors.foreground },
};

const buttonVariantStyles: Record<string, { container: object; text: object }> = {
  primary: {
    container: { backgroundColor: colors.primary },
    text: { color: colors.primaryForeground },
  },
  secondary: {
    container: { backgroundColor: colors.secondary },
    text: { color: colors.secondaryForeground },
  },
  outline: {
    container: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.input },
    text: { color: colors.foreground },
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    text: { color: colors.foreground },
  },
  destructive: {
    container: { backgroundColor: colors.destructive },
    text: { color: colors.destructiveForeground },
  },
};

// --- Styles ---

const styles = StyleSheet.create({
  stack: { position: "relative" },
  scrollView: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  bodyText: { fontSize: fontSize.sm, color: colors.foreground },
  headingText: { fontSize: fontSize.lg, fontWeight: "700", color: colors.foreground },
  captionText: { fontSize: fontSize.xs, color: colors.mutedForeground },
  image: { width: "100%" },
  dividerHorizontal: { height: 1, backgroundColor: colors.border },
  dividerVertical: { width: 1, height: "100%", backgroundColor: colors.border },
  textInput: {
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 4,
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  buttonBase: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: fontSize.sm, fontWeight: "500" },
  disabled: { opacity: 0.5 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  selectTrigger: {
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { fontSize: fontSize.sm, color: colors.foreground },
  selectChevron: { fontSize: fontSize.xs, color: colors.mutedForeground },
  sliderPlaceholder: { padding: spacing.sm },
  cardBase: { borderRadius: radius.lg, padding: spacing.md },
  cardOutlined: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  cardElevated: {
    backgroundColor: colors.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardFilled: { backgroundColor: colors.secondary },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tabSelected: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: fontSize.sm, color: colors.mutedForeground },
  tabTextSelected: { color: colors.foreground, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: "85%",
    maxHeight: "80%",
  },
  chip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.xs, color: colors.foreground },
  chipTextSelected: { color: colors.primaryForeground },
});
