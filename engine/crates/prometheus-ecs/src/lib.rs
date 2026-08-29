#![forbid(unsafe_code)]
#![deny(missing_docs)]

//! # prometheus-ecs
//!
//! Archetypal ECS for the PROMETHEUS graphics engine.

use prometheus_error::{EngineError, EngineResult};

/// Maximum number of component types.
pub const MAX_COMPONENT_TYPES: usize = 256;

/// Opaque identifier for an entity, combining a 32-bit slot index and a 32-bit generation.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Entity(u64);

impl Entity {
    /// Null entity handle.
    pub const NULL: Self = Self(u64::MAX);

    /// Creates a new entity handle from index and generation.
    #[must_use]
    #[inline]
    pub const fn new(index: u32, generation: u32) -> Self {
        Self(((generation as u64) << 32) | index as u64)
    }

    /// Returns the slot index.
    #[must_use]
    #[inline]
    pub const fn index(&self) -> u32 {
        self.0 as u32
    }

    /// Returns the generation.
    #[must_use]
    #[inline]
    pub const fn generation(&self) -> u32 {
        (self.0 >> 32) as u32
    }
}

/// Identifies a component type.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ComponentId(u8);

impl ComponentId {
    /// Creates a new component ID.
    #[must_use]
    #[inline]
    pub const fn new(index: u8) -> Self {
        Self(index)
    }
    
    /// Returns the bit index.
    #[must_use]
    #[inline]
    pub const fn index(self) -> u8 {
        self.0
    }
}

/// A 256-bit bitset representing an archetype's signature.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
pub struct ArchetypeSignature([u64; 4]);

impl ArchetypeSignature {
    /// Creates an empty signature.
    #[must_use]
    #[inline]
    pub const fn empty() -> Self {
        Self([0; 4])
    }

    /// Returns a new signature with the component included.
    #[must_use]
    #[inline]
    pub const fn with(mut self, id: ComponentId) -> Self {
        self.0[(id.0 >> 6) as usize] |= 1_u64 << (id.0 & 63);
        self
    }

    /// Returns a new signature with the component excluded.
    #[must_use]
    #[inline]
    pub const fn without(mut self, id: ComponentId) -> Self {
        self.0[(id.0 >> 6) as usize] &= !(1_u64 << (id.0 & 63));
        self
    }

    /// Checks if the signature contains the given component.
    #[must_use]
    #[inline]
    pub const fn contains(&self, id: ComponentId) -> bool {
        self.0[(id.0 >> 6) as usize] & (1_u64 << (id.0 & 63)) != 0
    }

    /// Checks if this signature is a subset of another.
    #[must_use]
    #[inline]
    pub const fn is_subset_of(&self, other: &Self) -> bool {
        (self.0[0] & other.0[0]) == self.0[0]
            && (self.0[1] & other.0[1]) == self.0[1]
            && (self.0[2] & other.0[2]) == self.0[2]
            && (self.0[3] & other.0[3]) == self.0[3]
    }

    /// Checks if this signature intersects with another.
    #[must_use]
    #[inline]
    pub const fn intersects(&self, other: &Self) -> bool {
        (self.0[0] & other.0[0]) != 0
            || (self.0[1] & other.0[1]) != 0
            || (self.0[2] & other.0[2]) != 0
            || (self.0[3] & other.0[3]) != 0
    }
}

/// Pure data type that can be stored in the ECS.
pub trait Component: Copy + Send + Sync + bytemuck::Pod + 'static {
    /// Returns the stable identifier for this component.
    fn component_id() -> ComponentId;
}

/// A 16 KiB aligned block storing entities and their component columns.
#[repr(align(16384))]
#[derive(Debug)]
pub struct Chunk {
    /// Entities in this chunk.
    pub entities: Vec<Entity>,
    /// Component columns (one per component type in the archetype).
    pub columns: Vec<Vec<u8>>,
    component_sizes: Vec<usize>,
}

impl Chunk {
    /// Creates a new empty chunk.
    pub fn new(component_sizes: Vec<usize>) -> Self {
        let columns = component_sizes.iter().map(|_| Vec::new()).collect();
        Self {
            entities: Vec::new(),
            columns,
            component_sizes,
        }
    }

    /// Returns the number of entities in this chunk.
    #[must_use]
    #[inline]
    pub fn len(&self) -> usize {
        self.entities.len()
    }

    /// Checks if the chunk is empty.
    #[must_use]
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.entities.is_empty()
    }
    
    /// Pushes an entity and its raw component data.
    pub fn push(&mut self, entity: Entity, components_data: &[&[u8]]) {
        self.entities.push(entity);
        for (col, data) in self.columns.iter_mut().zip(components_data.iter()) {
            col.extend_from_slice(data);
        }
    }
}

/// Holds the signature and a list of chunks for a specific set of components.
#[derive(Debug)]
pub struct Archetype {
    signature: ArchetypeSignature,
    /// List of chunks in this archetype.
    pub chunks: Vec<Chunk>,
    component_sizes: Vec<usize>,
}

impl Archetype {
    /// Creates a new archetype.
    pub fn new(signature: ArchetypeSignature, component_sizes: Vec<usize>) -> Self {
        Self {
            signature,
            chunks: vec![Chunk::new(component_sizes.clone())],
            component_sizes,
        }
    }

    /// Returns the signature of this archetype.
    #[must_use]
    #[inline]
    pub fn signature(&self) -> &ArchetypeSignature {
        &self.signature
    }

    /// Returns the total number of entities in this archetype.
    #[must_use]
    #[inline]
    pub fn entity_count(&self) -> usize {
        self.chunks.iter().map(|c| c.len()).sum()
    }
}

#[derive(Clone, Copy)]
struct EntitySlot {
    generation: u32,
    archetype_index: usize,
    chunk_index: usize,
    row_index: usize,
    alive: bool,
}

/// The main ECS container.
pub struct World {
    slots: Vec<EntitySlot>,
    free_list: Vec<u32>,
    /// Archetypes in the world.
    pub archetypes: Vec<Archetype>,
    live_count: usize,
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}

impl World {
    /// Creates a new empty World.
    #[must_use]
    pub fn new() -> Self {
        Self {
            slots: Vec::new(),
            free_list: Vec::new(),
            archetypes: vec![Archetype::new(ArchetypeSignature::empty(), Vec::new())],
            live_count: 0,
        }
    }

    /// Spawns a new empty entity.
    pub fn spawn(&mut self) -> Entity {
        let (index, generation) = if let Some(index) = self.free_list.pop() {
            let slot = &mut self.slots[index as usize];
            slot.alive = true;
            slot.archetype_index = 0;
            slot.chunk_index = 0;
            slot.row_index = self.archetypes[0].chunks[0].len();
            (index, slot.generation)
        } else {
            let index = self.slots.len() as u32;
            let generation = 0;
            self.slots.push(EntitySlot {
                generation,
                archetype_index: 0,
                chunk_index: 0,
                row_index: self.archetypes[0].chunks[0].len(),
                alive: true,
            });
            (index, generation)
        };

        let entity = Entity::new(index, generation);
        self.archetypes[0].chunks[0].push(entity, &[]);
        self.live_count += 1;
        entity
    }

    /// Despawns an entity.
    pub fn despawn(&mut self, entity: Entity) -> EngineResult<()> {
        if !self.is_alive(entity) {
            return Err(EngineError::InvalidArgument {
                crate_name: "prometheus-ecs",
                symbol: "World::despawn",
                reason: "Entity is not alive",
            });
        }
        
        let slot = self.slots[entity.index() as usize];
        let arch = &mut self.archetypes[slot.archetype_index];
        let chunk = &mut arch.chunks[slot.chunk_index];
        
        // Swap remove logic (not strictly implemented for components to keep example simple,
        // but required for true ECS. Here we just mark as dead for simplicity, or we do actual swap remove).
        // Since we are creating a functional ECS, let's do a basic swap remove.
        let row = slot.row_index;
        let last_row = chunk.len() - 1;
        
        if row != last_row {
            // Swap entities
            chunk.entities.swap(row, last_row);
            // Swap components
            for (col, size) in chunk.columns.iter_mut().zip(chunk.component_sizes.iter()) {
                let size = *size;
                let row_start = row * size;
                let last_start = last_row * size;
                for i in 0..size {
                    col.swap(row_start + i, last_start + i);
                }
            }
            // Update slot for the swapped entity
            let swapped_entity = chunk.entities[row];
            self.slots[swapped_entity.index() as usize].row_index = row;
        }
        
        // Remove the last element
        chunk.entities.pop();
        for (col, size) in chunk.columns.iter_mut().zip(chunk.component_sizes.iter()) {
            col.truncate(col.len() - size);
        }
        
        let slot_mut = &mut self.slots[entity.index() as usize];
        slot_mut.alive = false;
        slot_mut.generation = slot_mut.generation.wrapping_add(1);
        self.free_list.push(entity.index());
        self.live_count -= 1;
        
        Ok(())
    }

    /// Checks if an entity is alive.
    #[must_use]
    #[inline]
    pub fn is_alive(&self, entity: Entity) -> bool {
        self.slots
            .get(entity.index() as usize)
            .is_some_and(|s| s.alive && s.generation == entity.generation())
    }

    /// Returns the number of alive entities.
    #[must_use]
    #[inline]
    pub fn entity_count(&self) -> usize {
        self.live_count
    }
}

/// Pre-computed filter with required and excluded signatures.
#[derive(Debug, Clone, Copy, Default)]
pub struct QueryPlan {
    required: ArchetypeSignature,
    excluded: ArchetypeSignature,
}

impl QueryPlan {
    /// Creates a new query plan.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            required: ArchetypeSignature::empty(),
            excluded: ArchetypeSignature::empty(),
        }
    }

    /// Requires the given component.
    #[must_use]
    pub const fn require(self, id: ComponentId) -> Self {
        Self {
            required: self.required.with(id),
            excluded: self.excluded,
        }
    }

    /// Excludes the given component.
    #[must_use]
    pub const fn exclude(self, id: ComponentId) -> Self {
        Self {
            required: self.required,
            excluded: self.excluded.with(id),
        }
    }

    /// Checks if the plan matches the given signature.
    #[must_use]
    #[inline]
    pub const fn matches(&self, archetype: &ArchetypeSignature) -> bool {
        self.required.is_subset_of(archetype) && !self.excluded.intersects(archetype)
    }
}

/// Immutable contiguous slice of a component column.
#[derive(Debug)]
pub struct ColumnView<'a, T: Component> {
    entities: &'a [Entity],
    items: &'a [T],
}

impl<'a, T: Component> ColumnView<'a, T> {
    /// Creates a new ColumnView.
    pub fn new(entities: &'a [Entity], items: &'a [T]) -> Self {
        Self { entities, items }
    }

    /// Returns the slice of components.
    pub fn as_slice(&self) -> &'a [T] {
        self.items
    }
}

/// Mutable contiguous slice of a component column.
#[derive(Debug)]
pub struct ColumnViewMut<'a, T: Component> {
    entities: &'a [Entity],
    items: &'a mut [T],
}

impl<'a, T: Component> ColumnViewMut<'a, T> {
    /// Creates a new ColumnViewMut.
    pub fn new(entities: &'a [Entity], items: &'a mut [T]) -> Self {
        Self { entities, items }
    }

    /// Returns the mutable slice of components.
    pub fn as_mut_slice(&mut self) -> &mut [T] {
        self.items
    }
}

/// A structural command.
#[derive(Debug)]
enum Command {
    Spawn(Entity),
    Despawn(Entity),
}

/// Fixed-capacity structural command queue.
pub struct CommandBuffer {
    commands: Vec<Command>,
    reserved_entities: u32,
    resolved: Vec<Entity>,
}

impl CommandBuffer {
    /// Creates a new CommandBuffer with the given capacity.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        Self {
            commands: Vec::with_capacity(capacity),
            reserved_entities: 0,
            resolved: Vec::with_capacity(capacity),
        }
    }

    /// Records a spawn command.
    pub fn spawn(&mut self) -> EngineResult<Entity> {
        let e = Entity::new(self.reserved_entities, u32::MAX);
        self.reserved_entities += 1;
        self.commands.push(Command::Spawn(e));
        Ok(e)
    }

    /// Records a despawn command.
    pub fn despawn(&mut self, entity: Entity) -> EngineResult<()> {
        self.commands.push(Command::Despawn(entity));
        Ok(())
    }

    /// Applies the commands to the world.
    pub fn apply(&mut self, world: &mut World) -> EngineResult<()> {
        self.resolved.clear();
        for cmd in &self.commands {
            match cmd {
                Command::Spawn(_) => {
                    let e = world.spawn();
                    self.resolved.push(e);
                }
                Command::Despawn(e) => {
                    let actual = if e.generation() == u32::MAX {
                        self.resolved[e.index() as usize]
                    } else {
                        *e
                    };
                    world.despawn(actual)?;
                }
            }
        }
        self.commands.clear();
        self.reserved_entities = 0;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use prometheus_math::Transform;

    impl Component for Transform {
        fn component_id() -> ComponentId {
            ComponentId::new(0)
        }
    }

    #[test]
    fn test_spawn_despawn() {
        let mut world = World::new();
        let e1 = world.spawn();
        assert!(world.is_alive(e1));
        assert_eq!(world.entity_count(), 1);

        world.despawn(e1).unwrap();
        assert!(!world.is_alive(e1));
        assert_eq!(world.entity_count(), 0);
    }

    #[test]
    fn test_generation_reuse() {
        let mut world = World::new();
        let e1 = world.spawn();
        world.despawn(e1).unwrap();
        let e2 = world.spawn();
        assert_eq!(e1.index(), e2.index());
        assert_ne!(e1.generation(), e2.generation());
    }

    #[test]
    fn test_archetype_signature() {
        let sig1 = ArchetypeSignature::empty().with(ComponentId::new(1));
        let sig2 = sig1.with(ComponentId::new(2));
        assert!(sig1.is_subset_of(&sig2));
        assert!(!sig2.is_subset_of(&sig1));
        assert!(sig1.intersects(&sig2));
    }

    #[test]
    fn test_query_plan() {
        let plan = QueryPlan::new().require(ComponentId::new(1)).exclude(ComponentId::new(3));
        let sig1 = ArchetypeSignature::empty().with(ComponentId::new(1));
        let sig2 = sig1.with(ComponentId::new(3));
        assert!(plan.matches(&sig1));
        assert!(!plan.matches(&sig2));
    }

    #[test]
    fn test_command_buffer() {
        let mut world = World::new();
        let mut cmd = CommandBuffer::new(10);
        let e = cmd.spawn().unwrap();
        cmd.despawn(e).unwrap();
        cmd.apply(&mut world).unwrap();
        assert_eq!(world.entity_count(), 0);
    }
}
