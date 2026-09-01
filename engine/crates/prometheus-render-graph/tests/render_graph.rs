use prometheus_render_graph::{
    GraphCapacity, GraphError, PassLabel, Queue, RenderGraph, ResourceLabel, TextureDesc, TextureFormat, TextureUsages,
};

fn texture() -> TextureDesc {
    TextureDesc::new(1_920, 1_080, TextureFormat::Rgba8Unorm, TextureUsages::TRANSIENT)
}

#[test]
fn compile_culls_dead_work_and_synchronizes_queues() -> Result<(), GraphError> {
    let mut graph = RenderGraph::new(GraphCapacity::desktop_default());
    let scene = graph.import_texture(texture(), ResourceLabel(1))?;
    let present = graph.import_render_target(texture(), ResourceLabel(2))?;
    let present_id = present.resource_id();

    let lit = {
        let mut pass = graph.begin_pass(PassLabel(10), Queue::Graphics, false)?;
        let _scene = pass.read(&scene)?;
        let output = pass.create_texture(texture(), ResourceLabel(3))?;
        let output = pass.write_color(output)?;
        pass.finish(output)?
    };

    let _dead = {
        let mut pass = graph.begin_pass(PassLabel(20), Queue::Graphics, false)?;
        let output = pass.create_texture(texture(), ResourceLabel(4))?;
        let output = pass.write_color(output)?;
        pass.finish(output)?
    };

    let composed = {
        let mut pass = graph.begin_pass(PassLabel(30), Queue::Compute, false)?;
        let _lit = pass.read(&lit)?;
        let output = pass.create_texture(texture(), ResourceLabel(5))?;
        let output = pass.write_storage(output)?;
        pass.finish(output)?
    };

    {
        let mut pass = graph.begin_pass(PassLabel(40), Queue::Graphics, true)?;
        let _composed = pass.read(&composed)?;
        let present = pass.write_color(present)?;
        let _present = pass.finish(present)?;
    }

    let compiled = graph.compile()?;
    assert_eq!(compiled.stats().active_passes, 3);
    assert_eq!(compiled.stats().culled_passes, 1);
    assert_eq!(compiled.stats().cross_queue_tokens, 2);
    assert_eq!(compiled.imported_resources(), &[scene.resource_id(), present_id]);
    assert!(compiled.barriers().iter().any(|barrier| barrier.access.is_none()));
    Ok(())
}

#[test]
fn non_overlapping_transients_reuse_a_logical_slot() -> Result<(), GraphError> {
    let mut graph = RenderGraph::new(GraphCapacity::desktop_default());

    let first = {
        let mut pass = graph.begin_pass(PassLabel(10), Queue::Graphics, false)?;
        let output = pass.create_texture(texture(), ResourceLabel(1))?;
        let output = pass.write_color(output)?;
        pass.finish(output)?
    };
    let first_id = first.resource_id();
    {
        let mut pass = graph.begin_pass(PassLabel(20), Queue::Graphics, true)?;
        let _first = pass.read(&first)?;
        pass.finish_without_output();
    }

    let second = {
        let mut pass = graph.begin_pass(PassLabel(30), Queue::Graphics, false)?;
        let output = pass.create_texture(texture(), ResourceLabel(2))?;
        let output = pass.write_color(output)?;
        pass.finish(output)?
    };
    let second_id = second.resource_id();
    {
        let mut pass = graph.begin_pass(PassLabel(40), Queue::Graphics, true)?;
        let _second = pass.read(&second)?;
        pass.finish_without_output();
    }

    let compiled = graph.compile()?;
    let first_slot = compiled
        .slots()
        .iter()
        .find(|assignment| assignment.resource == first_id)
        .map(|assignment| assignment.slot);
    let second_slot = compiled
        .slots()
        .iter()
        .find(|assignment| assignment.resource == second_id)
        .map(|assignment| assignment.slot);
    assert_eq!(first_slot, second_slot);
    assert!(first_slot.is_some());
    Ok(())
}

#[test]
fn reset_rejects_handles_from_the_previous_frame() -> Result<(), GraphError> {
    let mut graph = RenderGraph::new(GraphCapacity::desktop_default());
    let texture = graph.import_texture(texture(), ResourceLabel(1))?;
    graph.reset();
    let mut pass = graph.begin_pass(PassLabel(10), Queue::Graphics, true)?;
    assert_eq!(pass.read(&texture), Err(GraphError::StaleHandle));
    Ok(())
}

#[test]
fn equivalent_frames_produce_the_same_checksum() -> Result<(), GraphError> {
    fn frame_checksum(graph: &mut RenderGraph) -> Result<u64, GraphError> {
        graph.reset();
        let source = graph.import_texture(texture(), ResourceLabel(1))?;
        let mut pass = graph.begin_pass(PassLabel(10), Queue::Graphics, true)?;
        let _source = pass.read(&source)?;
        pass.finish_without_output();
        Ok(graph.compile()?.checksum())
    }

    let mut graph = RenderGraph::new(GraphCapacity::desktop_default());
    let first = frame_checksum(&mut graph)?;
    let second = frame_checksum(&mut graph)?;
    assert_eq!(first, second);
    assert_ne!(first, 0);
    Ok(())
}
