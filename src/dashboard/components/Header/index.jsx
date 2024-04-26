/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
/* eslint-env browser */
import moment from 'moment';
import React from 'react';
import PropTypes from 'prop-types';
import {
  styled,
  css,
  isFeatureEnabled,
  FeatureFlag,
  t,
  getSharedLabelColor,
  getExtensionsRegistry,
  SupersetClient,
} from '@superset-ui/core';
import { Global } from '@emotion/react';
import {
  LOG_ACTIONS_PERIODIC_RENDER_DASHBOARD,
  LOG_ACTIONS_FORCE_REFRESH_DASHBOARD,
  LOG_ACTIONS_TOGGLE_EDIT_DASHBOARD,
} from 'src/logger/LogUtils';
import Icons from 'src/components/Icons';
import Button from 'src/components/Button';
import { AntdButton, AntdDropdown } from 'src/components/';
import { findPermission } from 'src/utils/findPermission';
import { Tooltip } from 'src/components/Tooltip';
import { safeStringify } from 'src/utils/safeStringify';
import HeaderActionsDropdown from 'src/dashboard/components/Header/HeaderActionsDropdown';
import PublishedStatus from 'src/dashboard/components/PublishedStatus';
import UndoRedoKeyListeners from 'src/dashboard/components/UndoRedoKeyListeners';
import PropertiesModal from 'src/dashboard/components/PropertiesModal';
import { chartPropShape } from 'src/dashboard/util/propShapes';
import {
  UNDO_LIMIT,
  SAVE_TYPE_OVERWRITE,
  DASHBOARD_POSITION_DATA_LIMIT,
} from 'src/dashboard/util/constants';
import setPeriodicRunner, {
  stopPeriodicRender,
} from 'src/dashboard/util/setPeriodicRunner';
import { PageHeaderWithActions } from 'src/components/PageHeaderWithActions';
import DashboardEmbedModal from '../EmbeddedModal';
import OverwriteConfirm from '../OverwriteConfirm';
import { Switch } from 'antd';
import { CssEditor as AceCssEditor } from 'src/components/AsyncAceEditor';
import { Menu } from 'src/components/Menu';
import { template } from 'lodash';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';

const extensionsRegistry = getExtensionsRegistry();

const propTypes = {
  addSuccessToast: PropTypes.func.isRequired,
  addDangerToast: PropTypes.func.isRequired,
  addWarningToast: PropTypes.func.isRequired,
  user: PropTypes.object, // UserWithPermissionsAndRoles,
  dashboardInfo: PropTypes.object.isRequired,
  dashboardTitle: PropTypes.string,
  dataMask: PropTypes.object.isRequired,
  charts: PropTypes.objectOf(chartPropShape).isRequired,
  layout: PropTypes.object.isRequired,
  expandedSlices: PropTypes.object,
  customCss: PropTypes.string,
  colorNamespace: PropTypes.string,
  colorScheme: PropTypes.string,
  setColorScheme: PropTypes.func.isRequired,
  setUnsavedChanges: PropTypes.func.isRequired,
  isStarred: PropTypes.bool.isRequired,
  isPublished: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  fetchFaveStar: PropTypes.func.isRequired,
  fetchCharts: PropTypes.func.isRequired,
  saveFaveStar: PropTypes.func.isRequired,
  savePublished: PropTypes.func.isRequired,
  updateDashboardTitle: PropTypes.func.isRequired,
  editMode: PropTypes.bool.isRequired,
  setEditMode: PropTypes.func.isRequired,
  showBuilderPane: PropTypes.func.isRequired,
  updateCss: PropTypes.func.isRequired,
  logEvent: PropTypes.func.isRequired,
  hasUnsavedChanges: PropTypes.bool.isRequired,
  maxUndoHistoryExceeded: PropTypes.bool.isRequired,
  lastModifiedTime: PropTypes.number.isRequired,

  // redux
  onRefresh: PropTypes.func.isRequired,
  onUndo: PropTypes.func.isRequired,
  onRedo: PropTypes.func.isRequired,
  undoLength: PropTypes.number.isRequired,
  redoLength: PropTypes.number.isRequired,
  setMaxUndoHistoryExceeded: PropTypes.func.isRequired,
  maxUndoHistoryToast: PropTypes.func.isRequired,
  refreshFrequency: PropTypes.number,
  shouldPersistRefreshFrequency: PropTypes.bool.isRequired,
  setRefreshFrequency: PropTypes.func.isRequired,
  dashboardInfoChanged: PropTypes.func.isRequired,
  dashboardTitleChanged: PropTypes.func.isRequired,
};

const defaultProps = {
  colorNamespace: undefined,
  colorScheme: undefined,
};

const headerContainerStyle = theme => css`
  border-bottom: 1px solid ${theme.colors.grayscale.light2};
`;

const editButtonStyle = theme => css`
  color: ${theme.colors.primary.dark2};
`;

const actionButtonsStyle = theme => css`
  display: flex;
  align-items: center;

  .action-schedule-report {
    margin-left: ${theme.gridUnit * 2}px;
  }

  .undoRedo {
    display: flex;
    margin-right: ${theme.gridUnit * 2}px;
  }
`;

const StyledUndoRedoButton = styled(AntdButton)`
  padding: 0;
  &:hover {
    background: transparent;
  }
`;

const undoRedoStyle = theme => css`
  color: ${theme.colors.grayscale.light1};
  &:hover {
    color: ${theme.colors.grayscale.base};
  }
`;

const undoRedoEmphasized = theme => css`
  color: ${theme.colors.grayscale.base};
`;

const undoRedoDisabled = theme => css`
  color: ${theme.colors.grayscale.light2};
`;

const saveBtnStyle = theme => css`
  min-width: ${theme.gridUnit * 17}px;
  height: ${theme.gridUnit * 8}px;
`;

const discardBtnStyle = theme => css`
  min-width: ${theme.gridUnit * 22}px;
  height: ${theme.gridUnit * 8}px;
`;

class Header extends React.PureComponent {
  static discardChanges() {
    const url = new URL(window.location.href);

    url.searchParams.delete('edit');
    window.location.assign(url);
  }

  constructor(props) {
    super(props);
    this.state = {
      didNotifyMaxUndoHistoryToast: false,
      emphasizeUndo: false,
      emphasizeRedo: false,
      showingPropertiesModal: false,
      isDropdownVisible: false,
      templates:[],
      themeMode: localStorage.getItem('themeMode') || 'light',
      isFullScreen: false,
    };

    this.handleChangeText = this.handleChangeText.bind(this);
    this.handleCtrlZ = this.handleCtrlZ.bind(this);
    this.handleCtrlY = this.handleCtrlY.bind(this);
    this.toggleEditMode = this.toggleEditMode.bind(this);
    this.forceRefresh = this.forceRefresh.bind(this);
    this.startPeriodicRender = this.startPeriodicRender.bind(this);
    this.overwriteDashboard = this.overwriteDashboard.bind(this);
    this.showPropertiesModal = this.showPropertiesModal.bind(this);
    this.hidePropertiesModal = this.hidePropertiesModal.bind(this);
    this.setIsDropdownVisible = this.setIsDropdownVisible.bind(this);
  }
  
  componentDidMount() {
    const { refreshFrequency } = this.props;
    this.startPeriodicRender(refreshFrequency * 1000);
  }

  componentDidUpdate(prevProps) {
    if (this.props.refreshFrequency !== prevProps.refreshFrequency) {
      const { refreshFrequency } = this.props;
      this.startPeriodicRender(refreshFrequency * 1000);
    }
  }

  componentDidMount() {
    const savedThemeMode = localStorage.getItem('themeMode');
    console.log(savedThemeMode, "saved theme mode");
  
    if (savedThemeMode) {
      this.setState({ themeMode: savedThemeMode }, () => {
        console.log(this.state.themeMode, "updated theme mode"); // Confirm updated theme mode in state
        this.applyThemeStyles(savedThemeMode);
        console.log("Theme styles applied successfully");
      });
    } else {
      // Default theme mode if not found in localStorage
      this.applyThemeStyles(this.state.themeMode);
      console.log("Default theme styles applied");
    }
  }
  
  UNSAFE_componentWillReceiveProps(nextProps) {
    if (
      UNDO_LIMIT - nextProps.undoLength <= 0 &&
      !this.state.didNotifyMaxUndoHistoryToast
    ) {
      this.setState(() => ({ didNotifyMaxUndoHistoryToast: true }));
      this.props.maxUndoHistoryToast();
    }
    if (
      nextProps.undoLength > UNDO_LIMIT &&
      !this.props.maxUndoHistoryExceeded
    ) {
      this.props.setMaxUndoHistoryExceeded();
    }
  }

  componentWillUnmount() {
    stopPeriodicRender(this.refreshTimer);
    this.props.setRefreshFrequency(0);
    clearTimeout(this.ctrlYTimeout);
    clearTimeout(this.ctrlZTimeout);
  }

  handleChangeText(nextText) {
    const { updateDashboardTitle, onChange } = this.props;
    if (nextText && this.props.dashboardTitle !== nextText) {
      updateDashboardTitle(nextText);
      onChange();
    }
  }

  setIsDropdownVisible(visible) {
    this.setState({
      isDropdownVisible: visible,
    });
  }

  handleCtrlY() {
    this.props.onRedo();
    this.setState({ emphasizeRedo: true }, () => {
      if (this.ctrlYTimeout) clearTimeout(this.ctrlYTimeout);
      this.ctrlYTimeout = setTimeout(() => {
        this.setState({ emphasizeRedo: false });
      }, 100);
    });
  }

  handleCtrlZ() {
    this.props.onUndo();
    this.setState({ emphasizeUndo: true }, () => {
      if (this.ctrlZTimeout) clearTimeout(this.ctrlZTimeout);
      this.ctrlZTimeout = setTimeout(() => {
        this.setState({ emphasizeUndo: false });
      }, 100);
    });
  }

  forceRefresh() {
    if (!this.props.isLoading) {
      const chartList = Object.keys(this.props.charts);
      this.props.logEvent(LOG_ACTIONS_FORCE_REFRESH_DASHBOARD, {
        force: true,
        interval: 0,
        chartCount: chartList.length,
      });
      return this.props.onRefresh(
        chartList,
        true,
        0,
        this.props.dashboardInfo.id,
      );
    }
    return false;
  }

  startPeriodicRender(interval) {
    let intervalMessage;

    if (interval) {
      const { dashboardInfo } = this.props;
      const periodicRefreshOptions =
        dashboardInfo.common?.conf?.DASHBOARD_AUTO_REFRESH_INTERVALS;
      const predefinedValue = periodicRefreshOptions.find(
        option => Number(option[0]) === interval / 1000,
      );

      if (predefinedValue) {
        intervalMessage = t(predefinedValue[1]);
      } else {
        intervalMessage = moment.duration(interval, 'millisecond').humanize();
      }
    }

    const periodicRender = () => {
      const { fetchCharts, logEvent, charts, dashboardInfo } = this.props;
      const { metadata } = dashboardInfo;
      const immune = metadata.timed_refresh_immune_slices || [];
      const affectedCharts = Object.values(charts)
        .filter(chart => immune.indexOf(chart.id) === -1)
        .map(chart => chart.id);

      logEvent(LOG_ACTIONS_PERIODIC_RENDER_DASHBOARD, {
        interval,
        chartCount: affectedCharts.length,
      });
      this.props.addWarningToast(
        t(
          `This dashboard is currently auto refreshing; the next auto refresh will be in %s.`,
          intervalMessage,
        ),
      );
      if (dashboardInfo.common.conf.DASHBOARD_AUTO_REFRESH_MODE === 'fetch') {
        // force-refresh while auto-refresh in dashboard
        return fetchCharts(
          affectedCharts,
          false,
          interval * 0.2,
          dashboardInfo.id,
        );
      }
      return fetchCharts(
        affectedCharts,
        true,
        interval * 0.2,
        dashboardInfo.id,
      );
    };

    this.refreshTimer = setPeriodicRunner({
      interval,
      periodicRender,
      refreshTimer: this.refreshTimer,
    });
  }

  toggleEditMode() {
    this.props.logEvent(LOG_ACTIONS_TOGGLE_EDIT_DASHBOARD, {
      edit_mode: !this.props.editMode,
    });
    this.props.setEditMode(!this.props.editMode);
  }

  overwriteDashboard() {
    const {
      dashboardTitle,
      layout: positions,
      colorScheme,
      colorNamespace,
      customCss,
      updateCss,
      dashboardInfo,
      refreshFrequency: currentRefreshFrequency,
      shouldPersistRefreshFrequency,
      lastModifiedTime,
      slug,
    } = this.props;

    // check refresh frequency is for current session or persist
    const refreshFrequency = shouldPersistRefreshFrequency
      ? currentRefreshFrequency
      : dashboardInfo.metadata?.refresh_frequency;

    const currentColorScheme =
      dashboardInfo?.metadata?.color_scheme || colorScheme;
    const currentColorNamespace =
      dashboardInfo?.metadata?.color_namespace || colorNamespace;
    const currentSharedLabelColors = Object.fromEntries(
      getSharedLabelColor().getColorMap(),
    );

    const data = {
      certified_by: dashboardInfo.certified_by,
      certification_details: dashboardInfo.certification_details,
      css: customCss,
      dashboard_title: dashboardTitle,
      last_modified_time: lastModifiedTime,
      owners: dashboardInfo.owners,
      roles: dashboardInfo.roles,
      slug,
      metadata: {
        ...dashboardInfo?.metadata,
        color_namespace: currentColorNamespace,
        color_scheme: currentColorScheme,
        positions,
        refresh_frequency: refreshFrequency,
        shared_label_colors: currentSharedLabelColors,
      },
    };

    // make sure positions data less than DB storage limitation:
    const positionJSONLength = safeStringify(positions).length;
    const limit =
      dashboardInfo.common.conf.SUPERSET_DASHBOARD_POSITION_DATA_LIMIT ||
      DASHBOARD_POSITION_DATA_LIMIT;
    if (positionJSONLength >= limit) {
      this.props.addDangerToast(
        t(
          'Your dashboard is too large. Please reduce its size before saving it.',
        ),
      );
    } else {
      if (positionJSONLength >= limit * 0.9) {
        this.props.addWarningToast('Your dashboard is near the size limit.');
      }
      this.props.onSave(data, dashboardInfo.id, SAVE_TYPE_OVERWRITE);
    }
  }

  showPropertiesModal() {
    this.setState({ showingPropertiesModal: true });
  }

  hidePropertiesModal() {
    this.setState({ showingPropertiesModal: false });
  }

  showEmbedModal = () => {
    this.setState({ showingEmbedModal: true });
  };

  hideEmbedModal = () => {
    this.setState({ showingEmbedModal: false });
  };
     
  setThemeMode = (mode) => {
    localStorage.setItem('themeMode', mode);
    this.setState({ themeMode: mode }, () => {
      this.applyThemeStyles(mode);
    });
  };
  
  applyThemeStyles = (mode) => {
    // Define your CSS styles for light and dark themes
    const lightStyles = `
      .navbar {
        transition: opacity 0.5s ease;
        opacity: 0.05;
      }
      .navbar:hover {
        opacity: 1;
      }
      .chart-header .header {
        font-weight: normal;
        font-size: 12px;
      }
    `;

  const darkStyles = `
  body {
    background-color:#181515 !important;
   }
   
   #app {
    background-color:#181515 !important;
   }
   
   .css-1rq9nng .css-h8dzev .pvtTable {
   background-color:#181515 !important;
   }
   
   
   ul.ant-menu.ant-menu-light.main-nav.css-188dvs4.ant-menu-root.ant-menu-horizontal {
     background-color: #181515;
   }
   
   div.ant-col.ant-col-xs-24.ant-col-md-8 {
   background-color: #181515;
   }
   
   div.ant-menu-submenu-title {
     background-color: #181515;
   }
   
   
   li.ant-menu-submenu.ant-menu-submenu-horizontal.css-d1dar4 {
     background-color: #181515;
   }
   
   .ant-tabs-content-holder * {
     color: #fff !important;
     }
   .dashboard-content{
    background-color:#181515;
   }
   
   .header-with-actions {
       background-color: #bb86fc;
       color: #ffffff;
      }
   
   --.dragdroppable-column {
    background-color:#181515;
       color: white;
   }
   
   .css-o9kagx div .css-1dgvt7y {
   background-color:#181515;
   }
   
   div.ant-tabs-nav-wrap {
    background-color:#181515;
    color: #ffffff;
   }
   
   div.ant-select-selector {
      background-image: linear-gradient(-45deg, #2f2f2f, #202020);
      border-style:none;
   }
   
   .dashboard-component {
       background-image: linear-gradient(-45deg, #2f2f2f, #202020);
       color:white;
      }
   
   .dashboard-component-header {
      background-image: linear-gradient(-45deg, #2f2f2f, #202020);
       color:white;
      }
     
   .ant-tabs-content-holder * {
     color: #fff !important;
     }
   
   .main-nav .ant-menu-item a {
   color: #ffffff;
   }
   
   
   #main-menu .ant-menu-submenu:nth-child(4) .ant-menu-submenu-title
   {
    color: #ffffff;
   }
   
   #main-menu .ant-menu-submenu:nth-child(8) .ant-menu-submenu-title {
   color: #ffffff;
   }
   
   .css-1ihx2le .css-yk4l29 .superset-button{
    color:#fff;
   }
   
   .ant-tabs-content-holder{
    backgrount-color:#000000;
   }
   .css-1x85xji .superset-button .ant-badge-count{
     color:#000;
   }
   .css-1bzexgi{
    background:#000000;
   }
   .ant-dropdown-button .ant-btn svg{
     color:#bb86fc;
   }
   
   h4.css-vqun1m {
     color: #bb86fc;
   }
   
   .ant-tabs-tab-active *{
     color: #bb86fc;
   }
   
   #TABS-JwrXIgKDLS .ant-tabs-nav .dragdroppable-tab{
    color:#fff;
   } 
   
   
   div.css-14381v7 {
   background-color:#181515;
   }
   
   div.css-1pf7rkh {
   background-image: linear-gradient(-45deg, #2f2f2f, #202020);
     color:white;
   }
   
   
   
   div.css-1uyj2ql {
   background-image: linear-gradient(-45deg, #2f2f2f, #202020);
     color:white;
   }
   
   
   
   .css-1a2qin2 .css-18fkq2l {
     background-color:#181515;
   }
   
   
   .css-1a2qin2 .open .open
   {
     background-color:#181515;
       color:white;
   
   }
   
   .css-wlt4i6 div .ant-select-selector {
   background-image: linear-gradient(-45deg, #2f2f2f, #202020);
   }
   
   .css-1a2qin2 .css-lmih2o {
     background-color:#181515;
       color:white;
   
   }
   
   .css-wlt4i6 div:nth-child(1) .ant-form-vertical div .ant-form-item .ant-form-item-label label .css-r97my h4
   {    color:white;
   }
   
   
   h4.css-17r6vwm {
     color: #fff;
     
   }
   
   .css-1a2qin2 .css-14gj75u{
     background-color:#181515;
       color:white;
   }
   
   
   .css-slbic0 .superset-button span{
         color:white;
   }
   
   
   .css-3se2ft .css-1x85xji .superset-button
   {
       background-color:#FFDE9E;
   }
   
   
   div.grid-row.background--transparent.css-13133f7 {
   background-color:#181515;
   }
   
   .css-1rq9nng .css-h8dzev .pvtTable {
   background-color:#181515 !important;
   }   
  `;
  const selectedStyles = mode === 'dark' ? darkStyles : lightStyles;
  let styleElement = document.getElementById('theme-styles');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.setAttribute('id', 'theme-styles');
      document.head.appendChild(styleElement);
    }
    styleElement.innerHTML = selectedStyles;
  };
  toggleFullScreen = () => {
    const { isFullScreen } = this.state;
    const element = document.documentElement;

    if (!isFullScreen) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }

    this.setState({ isFullScreen: !isFullScreen });
  };

  render() {
    const {
      dashboardTitle,
      layout,
      expandedSlices,
      customCss,
      colorNamespace,
      dataMask,
      setColorScheme,
      setUnsavedChanges,
      colorScheme,
      onUndo,
      onRedo,
      undoLength,
      redoLength,
      onChange,
      onSave,
      updateCss,
      editMode,
      isPublished,
      user,
      dashboardInfo,
      hasUnsavedChanges,
      isLoading,
      refreshFrequency,
      shouldPersistRefreshFrequency,
      setRefreshFrequency,
      lastModifiedTime,
      logEvent,
    } = this.props;
    

    const userCanEdit =
      dashboardInfo.dash_edit_perm && !dashboardInfo.is_managed_externally;
    const userCanShare = dashboardInfo.dash_share_perm;
    const userCanSaveAs = dashboardInfo.dash_save_perm;
    const userCanCurate =
      isFeatureEnabled(FeatureFlag.EmbeddedSuperset) &&
      findPermission('can_set_embedded', 'Dashboard', user.roles);
    const refreshLimit =
      dashboardInfo.common?.conf?.SUPERSET_DASHBOARD_PERIODICAL_REFRESH_LIMIT;
    const refreshWarning =
      dashboardInfo.common?.conf
        ?.SUPERSET_DASHBOARD_PERIODICAL_REFRESH_WARNING_MESSAGE;

    const handleOnPropertiesChange = updates => {
      const { dashboardInfoChanged, dashboardTitleChanged } = this.props;

      setColorScheme(updates.colorScheme);
      dashboardInfoChanged({
        slug: updates.slug,
        metadata: JSON.parse(updates.jsonMetadata || '{}'),
        certified_by: updates.certifiedBy,
        certification_details: updates.certificationDetails,
        owners: updates.owners,
        roles: updates.roles,
      });
      setUnsavedChanges(true);
      dashboardTitleChanged(updates.title);
    };

    const NavExtension = extensionsRegistry.get('dashboard.nav.right');

    return (
      <div
        css={headerContainerStyle}
        data-test="dashboard-header-container"
        data-test-id={dashboardInfo.id}
        className="dashboard-header-container"
      >
        <PageHeaderWithActions
          editableTitleProps={{
            title: dashboardTitle,
            canEdit: userCanEdit && editMode,
            onSave: this.handleChangeText,
            placeholder: t('Add the name of the dashboard'),
            label: t('Dashboard title'),
            showTooltip: false,
          }}
          certificatiedBadgeProps={{
            certifiedBy: dashboardInfo.certified_by,
            details: dashboardInfo.certification_details,
          }}
          faveStarProps={{
            itemId: dashboardInfo.id,
            fetchFaveStar: this.props.fetchFaveStar,
            saveFaveStar: this.props.saveFaveStar,
            isStarred: this.props.isStarred,
            showTooltip: true,
          }}
          titlePanelAdditionalItems={[
            !editMode && (
              <PublishedStatus
                dashboardId={dashboardInfo.id}
                isPublished={isPublished}
                savePublished={this.props.savePublished}
                canEdit={userCanEdit}
                canSave={userCanSaveAs}
                visible={!editMode}
              />
            ),
          ]}
          rightPanelAdditionalItems={
            <div className="button-container">
              {userCanSaveAs && (
                <div
                  className="button-container"
                  data-test="dashboard-edit-actions"
                >
                  {editMode && (
                    <div css={actionButtonsStyle}>
                      <div className="undoRedo">
                        <Tooltip
                          id="dashboard-undo-tooltip"
                          title={t('Undo the action')}
                        >
                          <StyledUndoRedoButton
                            type="text"
                            disabled={undoLength < 1}
                          >
                            <Icons.Undo
                              css={[
                                undoRedoStyle,
                                this.state.emphasizeUndo && undoRedoEmphasized,
                                undoLength < 1 && undoRedoDisabled,
                              ]}
                              onClick={undoLength && onUndo}
                              data-test="undo-action"
                              iconSize="xl"
                            />
                          </StyledUndoRedoButton>
                        </Tooltip>
                        <Tooltip
                          id="dashboard-redo-tooltip"
                          title={t('Redo the action')}
                        >
                          <StyledUndoRedoButton
                            type="text"
                            disabled={redoLength < 1}
                          >
                            <Icons.Redo
                              css={[
                                undoRedoStyle,
                                this.state.emphasizeRedo && undoRedoEmphasized,
                                redoLength < 1 && undoRedoDisabled,
                              ]}
                              onClick={redoLength && onRedo}
                              data-test="redo-action"
                              iconSize="xl"
                            />
                          </StyledUndoRedoButton>
                        </Tooltip>
                      </div>
                      <Button
                        css={discardBtnStyle}
                        buttonSize="small"
                        onClick={this.constructor.discardChanges}
                        buttonStyle="default"
                        data-test="discard-changes-button"
                        aria-label={t('Discard')}
                      >
                        {t('Discard')}
                      </Button>
                      <Button
                        css={saveBtnStyle}
                        buttonSize="small"
                        disabled={!hasUnsavedChanges}
                        buttonStyle="primary"
                        onClick={this.overwriteDashboard}
                        data-test="header-save-button"
                        aria-label={t('Save')}
                      >
                        {t('Save')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {editMode ? (
                <UndoRedoKeyListeners
                  onUndo={this.handleCtrlZ}
                  onRedo={this.handleCtrlY}
                />
              ) : (
                <div css={actionButtonsStyle}>
                  {this.state.isFullScreen ? <FullscreenExitOutlined onClick={this.toggleFullScreen} />:<FullscreenOutlined onClick={this.toggleFullScreen} />}
                    {/* { ? 'Exit Full Screen' : 'Enter Full Screen'}
                  </FullscreenOutlined> */}
                  <Switch
                  onChange={(value) => {
                    const themeMode = value ? 'dark' : 'light';
                    this.setThemeMode(themeMode);
                    console.log(themeMode,"themeMode");
                  }}
                  
                  checkedChildren="🌙"
                  unCheckedChildren="☀️"
                  style={{ marginRight: 20, marginLeft: 20 }}
                  checked={this.state.themeMode === 'dark'}
                />

                  {NavExtension && <NavExtension />}
                  {userCanEdit && (
                    <Button
                    buttonStyle="secondary"
                    onClick={this.toggleEditMode}
                    data-test="edit-dashboard-button"
                    className="action-button"
                    css={editButtonStyle}
                    aria-label={t('Edit dashboard')}
                  >
                    {t('Edit dashboard')}
                  </Button>
                  )}
                </div>
              )}
            </div>
          }
          menuDropdownProps={{
            getPopupContainer: triggerNode =>
              triggerNode.closest('.header-with-actions'),
            visible: this.state.isDropdownVisible,
            onVisibleChange: this.setIsDropdownVisible,
          }}
          additionalActionsMenu={
            <HeaderActionsDropdown
              addSuccessToast={this.props.addSuccessToast}
              addDangerToast={this.props.addDangerToast}
              dashboardId={dashboardInfo.id}
              dashboardTitle={dashboardTitle}
              dashboardInfo={dashboardInfo}
              dataMask={dataMask}
              layout={layout}
              expandedSlices={expandedSlices}
              customCss={customCss}
              colorNamespace={colorNamespace}
              colorScheme={colorScheme}
              onSave={onSave}
              onChange={onChange}
              forceRefreshAllCharts={this.forceRefresh}
              startPeriodicRender={this.startPeriodicRender}
              refreshFrequency={refreshFrequency}
              shouldPersistRefreshFrequency={shouldPersistRefreshFrequency}
              setRefreshFrequency={setRefreshFrequency}
              updateCss={updateCss}
              editMode={editMode}
              hasUnsavedChanges={hasUnsavedChanges}
              userCanEdit={userCanEdit}
              userCanShare={userCanShare}
              userCanSave={userCanSaveAs}
              userCanCurate={userCanCurate}
              isLoading={isLoading}
              showPropertiesModal={this.showPropertiesModal}
              manageEmbedded={this.showEmbedModal}
              refreshLimit={refreshLimit}
              refreshWarning={refreshWarning}
              lastModifiedTime={lastModifiedTime}
              isDropdownVisible={this.state.isDropdownVisible}
              setIsDropdownVisible={this.setIsDropdownVisible}
              logEvent={logEvent}
            />
          }
          showFaveStar={user?.userId && dashboardInfo?.id}
          showTitlePanelItems
        />
        {this.state.showingPropertiesModal && (
          <PropertiesModal
            dashboardId={dashboardInfo.id}
            dashboardInfo={dashboardInfo}
            dashboardTitle={dashboardTitle}
            show={this.state.showingPropertiesModal}
            onHide={this.hidePropertiesModal}
            colorScheme={this.props.colorScheme}
            onSubmit={handleOnPropertiesChange}
            onlyApply
          />
        )}

        <OverwriteConfirm />

        {userCanCurate && (
          <DashboardEmbedModal
            show={this.state.showingEmbedModal}
            onHide={this.hideEmbedModal}
            dashboardId={dashboardInfo.id}
          />
        )}
        <Global
          styles={css`
            .ant-menu-vertical {
              border-right: none;
            }
          `}
        />
      </div>
    );
  }
}

Header.propTypes = propTypes;
Header.defaultProps = defaultProps;

export default Header;
